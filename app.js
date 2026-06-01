    /* =========================================================
       CONSTANTES & ÉTAT
    ========================================================= */
    const TEMP_KEY   = 'BALLTRAP_TEMP_SERIE'; // Gardé en localStorage (éphémère)
    const IDB_NAME   = 'BallTrapCoaching';
    const IDB_VERSION = 1;
    const MIGRATION_KEY = 'btc_migrated_v1';
    const IA_VERSION = 6; // Incrémenter pour forcer la régénération des analyses sauvegardées

    const SCORE_LIMITS = { 'FU': 25, 'DTL': 75, 'TRAP 1': 75, 'PCH': 25, 'CS': 25 };
    const DISC_IDS     = { 'FU': 'fu', 'DTL': 'dtl', 'TRAP 1': 'trap1', 'PCH': 'pch', 'CS': 'cs' };
    const DISC_DOUBLES = ['PCH', 'CS']; // Disciplines avec doublés

    var db = getEmptyDB();
    var currentTireur = "Moi";
    var _selectedDisc = 'FU'; // discipline sélectionnée depuis la page Élèves
    var currentDisc = "";
    var currentPoste = null;
    var currentVent = 'faible';  // Vent local ajusté par le coach
    var currentMeteoAPI = null;  // Météo récupérée par l'API
    var serieEnCours = [];
    var directionsEnCours = [];  // NOUVEAU : Stocke les trajectoires (G, dG, C, dD, D)
    var actionEnAttente = null;  // NOUVEAU : Pour le clavier à 2 temps
    var wakeLock = null;         // Pour garder l'écran allumé

    // ---- PCH/CS : Variables d'état ----
    var _menuPCH = [];           // Menu séquentiel : [{type:'simple'|'double', poste:N, ...}, ...]
    var _indexMenu = 0;          // Index courant dans _menuPCH
    var _lignePCH = 5;           // Nombre de postes (3, 4 ou 5)
    var _posteSpecialPCH = 2;    // Pour ligne 4 : poste ayant 3 machines (2 ou 3)
    var _csGrilleNum = 0;       // Numéro de grille CS (1-40), 0 = non défini
    var _noBirdCount = 0;        // Compteur No Bird

    /* =========================================================
       BANQUE_PHRASES_COACH — Dictionnaire centralisé V3 FINAL
       Toutes les phrases de coaching avec tags discipline
       disc: ['ALL'] = toutes disciplines | ['PCH','CS'] = spécifique
    ========================================================= */
    const BANQUE_PHRASES_COACH = {

        // ═══════════════════════════════════════════════════
        // 1. NIVEAU
        // ═══════════════════════════════════════════════════
        niveau_excellent:  { disc: ['ALL'], phrases: ['excellent','très solide','remarquable'] },
        niveau_bon:        { disc: ['ALL'], phrases: ['bon','régulier','fiable'] },
        niveau_correct:    { disc: ['ALL'], phrases: ['correct','en développement','encourageant'] },
        niveau_perfectible:{ disc: ['ALL'], phrases: ['perfectible','à construire','en progression'] },

        // ═══════════════════════════════════════════════════
        // 2. TENDANCE
        // ═══════════════════════════════════════════════════
        tendance_premiere:  { disc: ['ALL'], phrases: ['sur cette première série de référence','sur cette séance qui servira de base'] },
        tendance_progression: { disc: ['ALL'], phrases: [] }, // dynamique — rempli avec delta
        tendance_recul:     { disc: ['ALL'], phrases: ['avec une légère baisse de régularité à surveiller','avec quelques séances en retrait par rapport aux meilleures performances'] },
        tendance_stable:    { disc: ['ALL'], phrases: ['avec un niveau stable et homogène','avec une bonne constance dans les résultats'] },

        // ═══════════════════════════════════════════════════
        // 3. IRRÉGULARITÉ / CONSEILS GLOBAUX
        // ═══════════════════════════════════════════════════
        irregularite:    { disc: ['ALL'], phrases: ['La régularité est le principal chantier',"L'irrégularité des résultats mérite attention"] },
        stable_bon:      { disc: ['ALL'], phrases: [
            "intensifier le travail sur la gestion du stress en compétition",
            "varier les conditions d'entraînement pour sortir de la zone de confort",
            "travailler la constance sur la totalité des 25 tirs sans relâchement en fin de série"
        ]},
        base_conseil:    { disc: ['ALL'], phrases: ['consolider les bases techniques','répéter les fondamentaux sur chaque poste','travailler la régularité avant de chercher la performance'] },
        general_conseil: { disc: ['ALL'], phrases: [
            "Revenir aux fondamentaux : position des pieds, épauler, poser ton regard, appeler ton plateau — le reste suivra",
            "Ne brûle pas les étapes : un tir solide repose sur des bases mécaniques justes"
        ]},

        // ═══════════════════════════════════════════════════
        // 4. CONSEILS FATIGUE (V3 FINAL)
        // ═══════════════════════════════════════════════════
        fatigue: { disc: ['ALL'], phrases: [
            "La fatigue de fin de série trahit un relâchement. Mets 3 ou 4 cartouches supplémentaires dans tes poches sans les compter. Si tu ne sais pas où tu en es, tu ne peux pas relâcher sur le dernier.",
            "Tu lâches en fin de série. Avant les tirs 18-25, redis-toi « nouvelle série, 0-0 » pour garder la même intensité qu'au début.",
            "Travaille l'endurance mentale : en compétition, la fatigue arrive souvent sur les derniers tirs. Charge plus de cartouches que nécessaire pour ne jamais savoir où tu en es dans la série.",
            "Le 25ème plateau doit être traité comme le 1er. Si tu relâches, c'est que ton cerveau a déjà quitté la série.",
            "Le coup de barre en fin de série, c'est pas physique, c'est mental. Ton corps tient, c'est ton focus qui lâche."
        ]},

        // ═══════════════════════════════════════════════════
        // 5. TROU D'AIR MILIEU (V3 FINAL)
        // ═══════════════════════════════════════════════════
        trou_milieu: { disc: ['ALL'], phrases: [
            "Le trou d'air du milieu est classique : on se sent bien après un bon départ et on relâche. Reste vigilant sur les tirs 9-17, c'est là que se jouent les grandes séries.",
            "Sur les tirs 11-15, impose-toi le même rituel strict qu'au tir 1. C'est la zone danger où la concentration baisse souvent.",
            "Zone 9-17 = zone rouge. Traite chaque plateau de cette zone comme s'il était le premier de ta série."
        ]},

        // ═══════════════════════════════════════════════════
        // 6. ROUTINES / RATÉS CONSÉCUTIFS
        // ═══════════════════════════════════════════════════
        routines: { disc: ['ALL'], phrases: [
            "Travaille ta routine de RÉINITIALISATION : après chaque tir, souffle 2 secondes, replace tes pieds, recentre ton regard. Chaque plateau = premier plateau.",
            "Le mental te joue des tours après un raté. Exercice : en entraînement, demande à quelqu'un de faire du bruit inattendu après ton annonce. Apprends à rester concentré quoi qu'il arrive.",
            "Ton problème n'est pas technique mais mental. La prochaine séance, fixe-toi un seul objectif : accepter le raté et passer immédiatement au plateau suivant."
        ]},

        // ═══════════════════════════════════════════════════
        // 7. CONSEILS ZONE (par zone de 5)
        // ═══════════════════════════════════════════════════
        zone_1_5:  { disc: ['ALL'], phrases: ["Les tirs 1-5 restent ton point faible récurrent. Travaille spécifiquement ton placement de départ, ta position de pieds, ta vision centrale AVANT l'annonce."] },
        zone_6_10: { disc: ['ALL'], phrases: ["Les tirs 6-10 te posent problème régulièrement. Concentre-toi sur la lecture de trajectoire latérale, prends plus d'avance sur ces angles."] },
        zone_11_15:{ disc: ['ALL'], phrases: ["La zone 11-15 est ton talon d'Achille. C'est souvent là que la routine s'installe mal. Répète ces tirs en série isolée."] },
        zone_16_20:{ disc: ['ALL'], phrases: ["Les tirs 16-20 te coûtent cher. C'est la zone de fatigue mentale. Entraîne-toi à rester hyper vigilant sur ce passage."] },
        zone_21_25:{ disc: ['ALL'], phrases: ["Les derniers tirs (21-25) restent difficiles pour toi. La fin de série n'est pas une formalité, garde la même intensité qu'au tir 1."] },

        // ═══════════════════════════════════════════════════
        // 8. ANTICIPATION / 2ème COUP (FOSSE UNIQUEMENT)
        // ═══════════════════════════════════════════════════
        anticipation_fosse: { disc: ['FU','DTL','TRAP 1'], phrases: [
            "Trop de deuxièmes coups : attention à ne pas « jeter tes canons » à l'appel. Tu pars probablement sur une trajectoire imaginaire avant d'avoir lu le plateau. Verrouille ton fusil, appelle, lis la trajectoire, puis attaque.",
            "Beaucoup de rattrapages. Le défaut classique : tu déclenches ton mouvement en même temps que tu dis « pull ». Attends impérativement de VOIR le plateau sortir avant de bouger tes canons.",
            "Les tirs au second coup montrent souvent une anticipation erronée. Tu pars « à l'aveugle » au moment de l'appel. Laisse le plateau sortir de la fosse, identifie sa direction exacte, et lance ton swing seulement après."
        ]},

        // ═══════════════════════════════════════════════════
        // 9. DTL / TRAP 1 — JARGON SPÉCIFIQUE
        // ═══════════════════════════════════════════════════
        dtl_jargon: { disc: ['DTL'], phrases: [
            "DTL : L'assurance du 2ème coup ne suffit pas, il te coûte des points précieux. Tu dois être plus tranchant et agressif sur ton premier coup. Ton swing doit exploser le plateau, pas le suivre."
        ]},
        trap1_jargon: { disc: ['TRAP 1'], phrases: [
            "RÉACTIVITÉ : Trop de tirs au 2ème coup. Acquisition lente, ton œil doit accrocher la cible plus vite."
        ]},

        // ═══════════════════════════════════════════════════
        // 10. EXPERT / CONFIRMÉ
        // ═══════════════════════════════════════════════════
        expert: { disc: ['ALL'], phrases: [
            "Tu as le niveau pour viser 90%+. Maintenant c'est la régularité qui compte : enchaîne 3 séries à ce niveau-là.",
            "Techniquement au point, le défi est mental. Travaille la gestion de la pression en simulant des conditions de compétition.",
            "Ton score est solide. Pour progresser, travaille ta constance : l'objectif est de faire ce score MINIMUM à chaque séance."
        ]},
        general: { disc: ['ALL'], phrases: [
            "Pour progresser, identifie UN point à améliorer (technique, mental, routine) et travaille-le spécifiquement à la prochaine séance.",
            "La clé est dans les détails : position, respiration, tempo d'annonce. Relis ta routine et cherche les points à affiner."
        ]},

        // ═══════════════════════════════════════════════════
        // 11. PCH — LECTURE DE TRAJECTOIRE (V3 FINAL)
        // ═══════════════════════════════════════════════════
        pch_traversards: { disc: ['PCH'], phrases: [
            "PCH : Trop de ratés sur les traversards. Le défaut classique : tu arrêtes ton swing au moment du tir. Sur un traversard, ton fusil doit AVANCER plus vite que le plateau. Accélère ta main avant au passage du plateau.",
            "PCH : Tu casses le premier mais tu rates le deuxième sur les traversards. Erreur : ton swing s'arrête après le premier tir. Le deuxième plateau est déjà en vol, tu dois relancer immédiatement ton mouvement."
        ]},
        pch_rentrants: { disc: ['PCH'], phrases: [
            "PCH : Les rentrants te posent problème. C'est le tir où le plateau vient vers toi. Le piège : tu vas chercher le plateau trop tôt et tu tires à l'arrêt. Laisse-le venir, ton swing doit être un mouvement vers l'avant."
        ]},
        pch_fuyants: { disc: ['PCH'], phrases: [
            "PCH : Les fuyants (plateaux qui s'éloignent) sont ton point faible. L'erreur : pas assez d'avance. Le plateau accélère en s'éloignant, ta bande doit être plus généreuse que ce que tu penses. Suis ton plateau quand il disparaît derrière tes canons, tire tout en gardant la même vitesse de mouvement."
        ]},
        pch_surplombs: { disc: ['PCH'], phrases: [
            "PCH : Les surplombs (plateaux qui montent) te déstabilisent. Le problème postural : tu lèves la tête au lieu de monter les mains. Garde la joue soudée à la crosse et laisse tes bras monter."
        ]},
        pch_battements: { disc: ['PCH'], phrases: [
            "PCH : Les battements (plateaux qui montent puis redescendent) exigent une lecture complète. Ne tire pas à la montée si ton taux de réussite est meilleur à la descente. Choisis ton point de cassure en fonction de tes forces. L'idéal étant de le tirer au point mort lorsqu'il atteint la hauteur max et va amorcer la descente, c'est là où il est le plus vulnérable."
        ]},

        // ═══════════════════════════════════════════════════
        // 12. PCH — LAPINS (V3 FINAL)
        // ═══════════════════════════════════════════════════
        pch_lapins: { disc: ['PCH'], phrases: [
            "PCH : Les lapins (plateaux roulants au sol) sont ton talon d'Achille. Erreur classique : tu vises trop bas. Le lapin roule, il faut le prendre comme un traversard bas. Place ta bande à hauteur du plateau et accélère en bas.",
            "PCH : Tu rates les lapins quand ils rebondissent. Prépare-toi à tirer APRÈS le rebond, pas avant. Le lapin décroche après le saut, c'est là qu'il est le plus stable à lire.",
            "PCH : Lapin en mouvement + terrain irrégulier = trajectoire imprévisible. La règle : suis-le des yeux avant de monter le fusil. Ne devine pas sa trajectoire, lis-la."
        ]},

        // ═══════════════════════════════════════════════════
        // 13. PCH — DISTANCE ET PROFONDEUR (V3 FINAL)
        // ═══════════════════════════════════════════════════
        pch_distance: { disc: ['PCH'], phrases: [
            "PCH : Tes ratés sur les plateaux longs montrent un problème de jauge de distance. Plus le plateau est loin, plus ta bande doit être généreuse. À 40 mètres, dépasse le généreusement et continue ton swing.",
            "PCH : Les plateaux courts te surprennent. Erreur : trop de bande sur un plateau proche. À 15 mètres, le plomb arrive presque instantanément. Réduis ton avance et sois précis.",
            "PCH : Tu hésites entre avance courte et avance longue. Règle d'or : commence toujours par repérer le point de cassure AVANT de monter le fusil.",
            "PCH : Les changements de distance entre les Parcours sont ton ennemi. Un stand à 20m, le suivant à 40m : ta référence de bande et d'avance doit changer à chaque fois."
        ]},

        // ═══════════════════════════════════════════════════
        // 14. PCH — ENCHAÎNEMENT DE PARCOURS (V3 FINAL)
        // ═══════════════════════════════════════════════════
        pch_enchainement: { disc: ['PCH'], phrases: [
            "PCH : La difficulté du parcours, c'est l'adaptation permanente. Chaque Parcours est un nouveau problème à résoudre. Ne reste pas sur le parcours précédent : efface, observe, analyse le nouveau Parcours.",
            "PCH : La transition entre les parcours est un moment critique. Prends 10 secondes avant chaque plateau pour visualiser son plan de vol.",
            "PCH : Les parcours combinés (2 plateaux simultanés ou en décalé) te font perdre la notion de priorité. Règle : toujours casser le plateau le plus menaçant en premier."
        ]},

        // ═══════════════════════════════════════════════════
        // 15. PCH — LE DOUBLÉ / DOUBLER UN PLATEAU (V3 FINAL)
        // ═══════════════════════════════════════════════════
        pch_doubler: { disc: ['PCH'], phrases: [
            "PCH : Tu utilises beaucoup le doublé pour sécuriser tes points. C'est bien, mais si ton taux de 1er coup est trop bas, tu dépenses trop de cartouches en rattrapage. Le 1er coup doit rester ton arme principale, le doublé est un filet de sécurité.",
            "PCH : Ton taux de doublé réussi est bon — tu sais terminer le travail. Mais attention : un doublé raté, c'est deux cartouches perdues sur un seul plateau. Sois sélectif sur tes doublés, ne les tente que si tu as vu ton 1er coup passer juste à côté.",
            "PCH : Tu hésites à doubler alors que ton 1er coup est souvent juste à côté. Si tu vois ton plomb passer près, recharge et double ! En PCH, un point sauvé au doublé vaut autant qu'un point au 1er coup.",
            "PCH : Tu rates trop de doublés. Le problème : après un 1er coup raté, tu précipites le 2ème. Respire, replace tes mains, relis le plateau. Un doublé réussi demande la même qualité de geste qu'un 1er coup."
        ]},

        // ═══════════════════════════════════════════════════
        // 16. PCH — TERRAIN ET CONDITIONS (V3 FINAL)
        // ═══════════════════════════════════════════════════
        pch_terrain: { disc: ['PCH'], phrases: [
            "PCH : Le terrain est un facteur que la fosse n'a pas. Arbre en fond, lumière rasante, fond sombre : chaque parcours a son propre environnement visuel. Repère où tu vas voir le plateau avant d'appeler.",
            "PCH : Le soleil change de position entre les parcours. Ne fixe pas la lumière, fixe la zone de sortie du plateau.",
            "PCH : Le vent en parcours n'est pas le même qu'en fosse. Selon l'orientation du stand, le vent peut porter le plateau, le freiner, ou le dévier latéralement. Lis le vent AVANT d'appeler."
        ]},

        // ═══════════════════════════════════════════════════
        // 17. CS — POSTE ET TRAJECTOIRE (V3 FINAL)
        // ═══════════════════════════════════════════════════
        cs_poste: { disc: ['CS'], phrases: [
            "CS : Le poste X est ton point noir. Mais attention, en Compak, chaque poste a 5 trajectoires différentes. Identifie laquelle te coûte le plus : les traversards, les rentrants, les fuyants ou les lapins ?",
            "CS : Ton taux de réussite varie fortement entre les postes. Travaille les postes où ton taux chute sous 60%.",
            "CS : Le poste 3 est traditionnellement le plus technique en Compak (trajectoires croisées, changements de direction). Si tu rates au poste 3, c'est souvent un problème de lecture de croisement.",
            "CS : Les trajectoires changent à chaque poste mais restent les mêmes sur un poste donné. Utilise cette répétition : les 5 premiers tirs servent à caler ta bande, les 5 suivants doivent être à 80%+."
        ]},
        cs_adaptation: { disc: ['CS'], phrases: [
            "CS : Tu rates les premiers tirs de chaque poste mais tu te rattrapes sur les derniers. Problème d'adaptation : avant le premier plateau du poste, visualise le plan de vol que le chef de stand t'a décrit.",
            "CS : Tu rates les derniers tirs du poste après un bon début. Syndrome de complaisance : tu as compris la trajectoire, donc tu te relâches. Chaque plateau doit être traité comme le premier.",
            "CS : Les changements de poste te déstabilisent. Prends 5 secondes de reset entre les postes. Respire, revisualise, puis entre."
        ]},
        cs_pas_doubler: { disc: ['CS'], phrases: [
            "CS : Pas de possibilité de doubler un plateau en Compak. Ton erreur est définitive. La pression est différente de la fosse et du PCH. Apprends à gérer cette irréversibilité : sois patient à l'acquisition, décisif au déclenchement.",
            "CS : Si tu viens de la fosse ou du PCH, le réflexe du 2ème coup ou du doublé est profondément ancré. En Compak, ce réflexe n'existe plus. Ton approche doit être plus chirurgicale : un seul coup, une seule chance.",
            "CS : L'absence de pouvoir doubler change ta gestion mentale. Tu ne peux pas « sauver » un mauvais premier coup. Cette contrainte doit te rendre plus vigilant sur la qualité de ton acquisition visuelle."
        ]},
        cs_meteo: { disc: ['CS'], phrases: [
            "CS : Le vent affecte chaque poste différemment en Compak. Un vent de travers sur le poste 1 peut être vent de face au poste 3. Réévalue les conditions à chaque changement de poste.",
            "CS : La lumière varie entre les postes. Le poste 2 peut être à contre-jour quand le poste 4 est en pleine lumière. Adapte ton regard à chaque changement."
        ]},
        cs_memoire: { disc: ['CS'], phrases: [
            "CS : Chaque poste a sa carte d'identité : trajectoire dominante, distance moyenne, ensoleillement. Mémorise ces caractéristiques pour les prochaines séries.",
            "CS : Si tu rates toujours le même type de trajectoire d'un poste à l'autre (ex: les traversards), le problème n'est pas le poste, c'est ta technique sur ce type d'angle. Isole ce type de plateau en entraînement."
        ]},

        // ═══════════════════════════════════════════════════
        // 22-26. DOUBLÉS ANALYSE (PCH+CS, V3 FINAL)
        // ═══════════════════════════════════════════════════
        doubles_2sur2: { disc: ['PCH','CS'], phrases: [
            "Doublés 2/2 : Excellente gestion des paires. Tu enchaînes les deux tirs sans hésitation, ton swing est fluide entre le premier et le deuxième plateau. C'est la signature d'un tireur qui lit vite et exécute bien.",
            "Doublés 2/2 : Ta réussite sur les doublés est impressionnante. Tu ne te laisses pas déborder par le deuxième plateau. Continue à travailler ce point fort, c'est un avantage concurrentiel.",
            "Doublés 2/2 récurrents : Ton taux de doublés propres est élevé. Attention cependant à ne pas te reposer sur cette compétence au détriment du 1er coup en série simple."
        ]},
        doubles_1sur2: { disc: ['PCH','CS'], phrases: [
            "Doublés 1/2 : Tu rates régulièrement le deuxième plateau du doublé. Le défaut classique : après avoir cassé le premier, tu relâches ta concentration ou tu précipites ton geste sur le deuxième. Reprends ta routine entre les deux tirs.",
            "Doublés 1/2 : Tu rates souvent le premier plateau du doublé mais tu rattrapes le deuxième. Problème d'entrée : tu n'es pas prêt quand les plateaux sortent. Verrouille ta position et ton regard AVANT l'appel.",
            "Doublés 1/2 : Un sur deux, c'est la moitié des points perdus sur les paires. Le problème est souvent un mauvais choix de priorité : tu te prépares pour le premier plateau sans anticiper le deuxième. Visualise les DEUX trajectoires avant d'appeler.",
            "Doublés 1/2 : Tu casses le premier mais tu rates le deuxième sur les traversards. Erreur : ton swing s'arrête après le premier tir. Le deuxième plateau est déjà en vol, tu dois relancer immédiatement ton mouvement.",
            "Doublés 1/2 : Quand tu rates le premier plateau du doublé, le deuxième est souvent sauvé en mode « réparation ». C'est un réflexe de rattrapage. Travaille l'approche du doublé comme deux tirs indépendants, pas comme un tir + un sauvetage.",
            "Doublés 1/2 récurrents : Ton taux de 1/2 est élevé. La question est : quel plateau rates-tu le plus ? Si c'est toujours le deuxième, c'est un problème de gestion du temps. Si c'est toujours le premier, c'est un problème d'acquisition."
        ]},
        doubles_0sur2: { disc: ['PCH','CS'], phrases: [
            "Doublés 0/2 : Aucun plateau cassé sur les doublés, c'est un signal d'alarme. Le problème est global : tu es débordé par la vitesse ou la complexité des paires. Revoyons ta stratégie de gestion des doublés.",
            "Doublés 0/2 : Tu paniques sur les doublés. Le premier plateau est raté parce que tu es déjà en train de penser au deuxième. Règle : traite le premier plateau du doublé comme un tir simple. Le deuxième n'existe pas tant que le premier n'est pas tiré.",
            "Doublés 0/2 : Deux ratés d'affilée sur un doublé, c'est un effondrement mental. Le deuxième plateau subit les conséquences du premier raté. Travaille le reset entre les deux tirs du doublé : chaque plateau est un nouveau match."
        ]},
        doubles_pch: { disc: ['PCH'], phrases: [
            "PCH : Les doublés en parcours sont plus complexes qu'en fosse car les trajectoires sont différentes à chaque stand. Avant d'appeler, décide l'ordre de tir : toujours le plateau le plus rapide ou le plus près de sa zone de disparition en premier.",
            "PCH : Sur les doublés, le deuxième plateau ne t'attend pas. Si tu rates le premier, ne pars pas à sa poursuite. Lâche-le immédiatement et concentre-toi sur le deuxième. Un sur deux vaut mieux que zéro sur deux.",
            "PCH : Les doublés réussis en parcours demandent une qualité de lecture que seule la pratique apporte. Si ton taux de doublés est faible, commence par des doublés simples (même angle, même direction) avant de passer aux combinés."
        ]},
        doubles_cs: { disc: ['CS'], phrases: [
            "CS : Les doublés en Compak sont la combinaison de deux trajectoires différentes sur le même poste. Si tu rates régulièrement le deuxième plateau, identifie sa trajectoire : est-ce toujours le même type (rentrant, fuyant, traversard) qui te coûte le deuxième coup ?",
            "CS : Sur les doublés, pas de rattrapage possible. Si tu rates le premier plateau du doublé, le deuxième doit être traité comme un tir de rédemption. Ne laisse pas la frustration du premier raté contaminer le deuxième. Respire, replace-toi, et tire ce deuxième plateau comme s'il était seul.",
            "CS : Les doublés en Compak exigent une planification préalable. Avant d'appeler, visualise le point de cassure du premier ET la transition vers le deuxième. La fluidité du mouvement entre les deux tirs fait la différence entre un 2/2 et un 1/2."
        ]},

        // ═══════════════════════════════════════════════════
        // 27. MOTS MAGIQUES PDF
        // ═══════════════════════════════════════════════════
        mots_magiques: { disc: ['ALL'], phrases: [
            "Excellente implication aujourd'hui. Chaque plateau tiré est une leçon apprise. Garde cette belle dynamique !",
            "La progression passe par la régularité. Un très bon état d'esprit sur le pas de tir, continue tes efforts !",
            "La confiance se construit pas à pas. Reste concentré sur tes objectifs, le travail finit toujours par payer.",
            "Une séance riche en enseignements. Garde cette superbe énergie pour notre prochain entraînement !",
            "Ton écoute et ta concentration font plaisir à voir. Les fondations sont solides, on lâche rien !",
            "Chaque série est une opportunité d'apprendre. Ton engagement est remarquable, continue sur cette lancée !",
            "La patience et la persévérance sont tes meilleurs alliés. Les résultats suivront, fais-moi confiance !",
            "Ton attitude sur le pas de tir est exemplaire. C'est comme ça qu'on construit la confiance, bravo !",
            "Il n'y a pas de petits progrès. Chaque plateau cassé est une victoire qui compte. Ne l'oublie jamais !",
            "Le chemin est long mais tu avances dans la bonne direction. Chaque entraînement te rapproche de ton objectif.",
            "Aujourd'hui était difficile mais tu n'as rien lâché. C'est ça la force mentale. Respect !",
            "Tu as su rester positif malgré les difficultés. Cette résilience est ta plus grande qualité."
        ]},

        // ═══════════════════════════════════════════════════
        // 27b. 100% GLOBAL — Toutes séries parfaites
        // ═══════════════════════════════════════════════════
        parfait_global: { disc: ['ALL'], phrases: [
            "Toutes les séries sont parfaites — 100% sur chaque. Le niveau est là, la régularité aussi. Maintenant, l'objectif est de reproduire ça en compétition, sous la pression du classement.",
            "Un bilan sans faute : 100% sur l'ensemble des séries. Tu as la technique et le mental pour viser la perfection à chaque sortie. Le défi ? Le confirmer en conditions de compétition.",
            "Des séries parfaites à 100% — tu ne laisses rien passer. La maîtrise est totale. La prochaine étape : exporter cette régularité en compétition où la pression change tout."
        ]},

        // ═══════════════════════════════════════════════════
        // 28. RECOMMANDATIONS PDF (TU-form)
        // ═══════════════════════════════════════════════════
        reco_fatigue:    { disc: ['ALL'], phrases: ["Travaille l'endurance mentale et le maintien de la concentration sur la durée."] },
        reco_fondamentaux:{ disc: ['ALL'], phrases: ["Revois les fondamentaux : position, montage, lâcher. Prévois des exercices ciblés."] },
        reco_parfaite:   { disc: ['ALL'], phrases: ["Série parfaite ! Confirme cette maîtrise en conditions de compétition."] },
        reco_gauche:     { disc: ['ALL'], phrases: ["Bonne séance. Axe de travail : les trajectoires à gauche, récurrentes sur cette série."] },
        reco_droite:     { disc: ['ALL'], phrases: ["Bonne séance. Axe de travail : les trajectoires à droite, récurrentes sur cette série."] },
        reco_isoles:     { disc: ['ALL'], phrases: ["Les ratés sont isolés. Pas de pattern inquiétant, continue le travail régulier."] },
        reco_progression:{ disc: ['ALL'], phrases: ["Bonne dynamique. Maintiens le rythme d'entraînement pour consolider les acquis."] },
        reco_generique:  { disc: ['ALL'], phrases: ["Continue les exercices ciblés sur les points faibles identifiés."] },

        // ═══════════════════════════════════════════════════
        // 29. VARIANCE PDF COMPÉTITION
        // ═══════════════════════════════════════════════════
        variance_excellente: { disc: ['ALL'], phrases: ["Excellente régularité, ton niveau est resté très homogène sur l'ensemble des postes."] },
        variance_classique:  { disc: ['ALL'], phrases: ["Une variance classique. La série la plus faible t'a coûté quelques points, mais pas de gros décrochage."] },
        variance_importante: { disc: ['ALL'], phrases: ["L'écart est important. Il faudra isoler ce qui a causé ce décrochage (météo, fatigue, relâchement mental ?)."] },

        // ═══════════════════════════════════════════════════
        // 30. ENDURANCE PDF COMPÉTITION
        // ═══════════════════════════════════════════════════
        endurance_parfaite:  { disc: ['ALL'], phrases: ["Physique et mental d'acier. Tenir la perfection sur l'intégralité du concours prouve une endurance de très haut niveau."] },
        endurance_baisse:    { disc: ['ALL'], phrases: ["Baisse de régime sur la deuxième partie du concours. La fatigue mentale ou physique a pesé, travaille la résistance sur la durée."] },
        endurance_remontee:  { disc: ['ALL'], phrases: ["Superbe remontée ! Tu as mis du temps à entrer dans ton match, mais tu as su élever ton niveau en cours de concours."] },
        endurance_regulier:  { disc: ['ALL'], phrases: ["Une régularité impressionnante du début à la fin. Ton rythme est resté constant, c'est une grande qualité."] },

        // ═══════════════════════════════════════════════════
        // 31-34. ORDONNANCES (V3 FINAL)
        // ═══════════════════════════════════════════════════
        ord_blocage_droite:  { disc: ['ALL'], phrases: [] }, // dynamique
        ord_blocage_gauche:  { disc: ['ALL'], phrases: [] }, // dynamique
        ord_suivi:           { disc: ['ALL'], phrases: ["Le Suivi : Tire 10 fuyants de face d'affilée. Règle d'or : tu dois garder la joue collée à la crosse et le fusil pointé vers les éclats pendant 2 secondes entières APRÈS avoir tiré."] },
        ord_reset_mental:    { disc: ['ALL'], phrases: ["Reset Mental : La pause forcée. À la prochaine séance, impose-toi cette règle : après chaque raté, tu dois casser ton fusil, le poser sur la pointe de la chaussure, souffler un grand coup (5 sec), et refaire ta routine à 100%."] },
        ord_anticipation:    { disc: ['FU','DTL','TRAP 1'], phrases: ["Anticipation visuelle : Entraînement « à blanc ». Épaule ton fusil (vide). Demande 5 plateaux. Contente-toi de suivre la trajectoire avec tes canons sans appuyer sur la détente. Apprends à ton œil à accrocher la cible AVANT que le fusil ne bouge."] },
        ord_endurance:       { disc: ['ALL'], phrases: ["Endurance : Mets 3 ou 4 cartouches supplémentaires dans tes poches sans les compter. Tire ta série normalement. Le but : ne jamais savoir à quel plateau tu es, éliminer le comptage mental qui provoque le relâchement du dernier plateau."] },
        ord_fondations:      { disc: ['ALL'], phrases: ["Les Fondations : Reviens aux bases. Ne tire que des plateaux simples (fuyants centraux) pendant 2 séries pour reprendre confiance dans ton épaulé et ton swing, sans te soucier du score ni des angles complexes."] },
        ord_pression:        { disc: ['ALL'], phrases: ["La Pression : Match play. Fais un duel avec un autre tireur de ton niveau sur une série d'entraînement. Le perdant paie le café. Apprends à tirer sous pression pour reproduire la tension de la compétition."] },
        ord_sniper:          { disc: ['ALL'], phrases: ["Le Sniper : Choisis UN angle de sortie. Tire 10 plateaux identiques d'affilée. Objectif : 10/10 au 1er coup."] },
        ord_echauffement:    { disc: ['ALL'], phrases: ["L'Échauffement Mental : Avant chaque série, isole-toi 2 minutes. Visualise 5 tirs parfaits."] },
        ord_contre_montre:   { disc: ['ALL'], phrases: ["Le Contre-La-Montre : Tire une série en réduisant le temps entre chaque plateau au minimum."] },
        ord_joker:           { disc: ['ALL'], phrases: ["Le Joker : Un seul « joker » si tu rates. Apprends à choisir quand utiliser ta seconde chance."] },
        ord_inverse:         { disc: ['ALL'], phrases: ["L'Inversé : Commence par le poste 5 et remonte vers le poste 1. Force l'adaptation."] },
        ord_pch_lecteur:     { disc: ['PCH'], phrases: ["Le Lecteur : Demande 10 plateaux de traversards à des distances différentes. Ne tire pas. Contente-toi de suivre la trajectoire du regard et de visualiser le point de cassure."] },
        ord_pch_lapinier:    { disc: ['PCH'], phrases: ["Le Lapinier : Demande 10 lapins d'affilée. Objectif : 10/10 en les prenant APRÈS le premier rebond."] },
        ord_pch_bande:       { disc: ['PCH'], phrases: ["La Bande Variable : Tire 5 plateaux courts (15m) puis 5 longs (40m) en alternance. Travaille le passage d'une avance courte à une avance longue."] },
        ord_pch_double:      { disc: ['PCH'], phrases: ["Le Doublé Maîtrisé : Tire 10 plateaux en doublant systématiquement, même quand tu casses au 1er coup. Objectif : ancrer le geste de recharge fluide pour que le doublé devienne un réflexe naturel."] },
        ord_cs_isole:        { disc: ['CS'], phrases: ["Le Poste Isolé : Choisis ton poste le plus faible. Tire 25 plateaux uniquement sur ce poste. Objectif : faire monter ton taux de 20% minimum."] },
        ord_cs_tour:         { disc: ['CS'], phrases: ["Le Tour Complet : Tire 5 plateaux à chaque poste en séquence. Objectif : 0 raté sur le premier plateau de chaque poste. Travaille l'adaptation immédiate."] },
        ord_cs_matching:     { disc: ['CS'], phrases: ["Le Matching : Tire uniquement les trajectoires qui te posent problème. Répète jusqu'à dépasser 70%. La spécificité vainc la difficulté."] },
        ord_cs_deuxieme:     { disc: ['CS'], phrases: ["Le Deuxième Passage : Tire une série complète. Note les ratés. Retire uniquement les plateaux ratés. Objectif : les casser au premier coup cette fois."] },
        ord_decouplage:      { disc: ['PCH','CS'], phrases: ["Le Découplage : Tire 10 doublés en te concentrant uniquement sur le premier plateau. Ignore le deuxième. Objectif : 10/10 au premier. Ensuite, fais l'inverse : concentre-toi uniquement sur le deuxième. Travaille chaque plateau du doublé comme un tir indépendant."] },
        ord_simul:           { disc: ['PCH','CS'], phrases: ["Le Simul : Avant chaque doublé, visualise les DEUX trajectoires. Épaulé à vide, simule le swing vers le premier plateau, puis la transition vers le deuxième. Ancre la séquence dans ta mémoire musculaire avant de charger."] },
        ord_chrono:          { disc: ['PCH','CS'], phrases: ["Le Chrono : Demande des doublés en réduisant le délai entre les deux plateaux. Objectif : maintenir le taux de réussite malgré la pression temporelle. Travaille la vitesse de décision et d'exécution."] },
        ord_premier_imp:     { disc: ['PCH','CS'], phrases: ["Le 1er Impératif : Tire 10 doublés avec une seule règle : le premier plateau DOIT être cassé. Peu importe le deuxième. Objectif : 10/10 au premier plateau du doublé. On stabilise d'abord le premier, on ajoutera le deuxième ensuite."] },

        // ═══════════════════════════════════════════════════
        // 35. ANALYSE STRATÉGIQUE (Semaine / Mensuelle)
        // ═══════════════════════════════════════════════════
        strato_seuil_insuffisant: { disc: ['ALL'], phrases: [
            "Pas encore assez de données pour une analyse stratégique fiable. Continue à tirer — l'analyse se débloquera avec plus de séries.",
            "Les premières séries servent de base de référence. Reviens générer l'analyse quand tu auras plus de données sur cette période."
        ]},
        strato_progression: { disc: ['ALL'], phrases: [
            "Tu es sur une pente ascendante — continue sur cette lancée ! La clé maintenant : ne change rien à ta routine, elle fonctionne.",
            "Belle progression ! Ce n'est pas un coup de chance, c'est le fruit de ton travail. Maintiens la pression.",
            "Tu grimpes. La tendance est claire et positive. Garde cette rigueur, les résultats suivent."
        ]},
        strato_regression: { disc: ['ALL'], phrases: [
            "Baisse de régime détectée. Pas de panique, mais ne l'ignore pas : identifie ce qui a changé (fréquence d'entraînement, fatigue, conditions ?) et corrige le tir.",
            "Tu recules. Ça arrive à tout le monde. La question : est-ce un creux passager ou un problème technique qui s'installe ? Si ça persiste, reviens aux fondamentaux.",
            "La régression est un signal. Ton corps ou ton mental te dit quelque chose. Prends du recul, analyse, et reviens plus fort."
        ]},
        strato_stagnation: { disc: ['ALL'], phrases: [
            "Tu stagnes. Ce n'est pas grave en soi, mais c'est là qu'il faut changer quelque chose : méthode, exercices, rythme. Si tu fais la même chose, tu auras les mêmes résultats.",
            "Résultats stables, mais pas de progression. C'est le moment de sortir de ta zone de confort : essaie un exercice que tu n'as jamais fait, travaille un angle que tu évites.",
            "Stagnation = plateau. Pour passer au niveau supérieur, il faut un changement de méthode, pas juste plus de la même chose."
        ]},
        strato_zone_recurente: { disc: ['ALL'], phrases: [
            "Les tirs {zone} restent ton point faible récurrent sur cette période. Ce n'est plus un accident, c'est un problème identifié. Isole cette zone en entraînement spécifique.",
            "Tu perds régulièrement des points sur les tirs {zone}. C'est le même défaut qui revient série après série — il est temps de le travailler en profondeur."
        ]},
        strato_discipline_delta: { disc: ['ALL'], phrases: [
            "En {disc}, ton taux de réussite a {sens} de {delta}% par rapport à la période précédente. {commentaire}",
            "Sur la période, ta {disc} {sens} de {delta}%. {commentaire}"
        ]},
        strato_deuxieme_coup: { disc: ['ALL'], phrases: [
            "Tu sauves beaucoup de plateaux au 2ème coup. Ton score est flatteur mais ta réactivité au 1er coup doit s'améliorer. En compétition, le rattrapage n'est pas garanti.",
            "Trop de dépendance au 2ème coup sur cette période. Ton 1er coup manque de tranchant — travaille ton agressivité à la sortie du plateau."
        ]},
        strato_parfait_periode: { disc: ['ALL'], phrases: [
            "Des séries parfaites sur la période — tu ne laisses rien passer. La maîtrise est là, maintenant exporte-la en compétition.",
            "Toutes les séries sont à 100% sur cette période. C'est exceptionnel. Le défi : reproduire ça quand ça compte."
        ]}
    };

    /* =========================================================
       MOTEUR DE SÉLECTION DES PHRASES
    ========================================================= */
    const _ALL_DISC = ['FU','DTL','TRAP 1','PCH','CS'];

    function _pickPhrase(categorie, disc) {
        const entry = BANQUE_PHRASES_COACH[categorie];
        if (!entry || !entry.phrases || !entry.phrases.length) return '';
        if (disc && entry.disc[0] !== 'ALL' && !entry.disc.includes(disc)) return '';
        return entry.phrases[Math.floor(Math.random() * entry.phrases.length)];
    }

    function _pickPhrasesFrom(categories, disc, nb) {
        const pool = [];
        categories.forEach(cat => {
            const entry = BANQUE_PHRASES_COACH[cat];
            if (entry && entry.phrases && entry.phrases.length) {
                if (entry.disc[0] === 'ALL' || !disc || entry.disc.includes(disc)) {
                    pool.push(...entry.phrases);
                }
            }
        });
        const shuffled = pool.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, nb || 1);
    }

    /* =========================================================
       CS : GRILLES OFFICIELLLES FITASC (40 grilles)
       Chaque grille = 5 postes, chaque poste définit :
         s: [machines simples], d: doublé(s) — objet ou tableau
    ========================================================= */
    // CS_GRILLES — Données FITASC 2025 (règlement au 01/01/2025)
    // Chaque grille = tableau de 5 entrées (1 par poste), index 0-4 = postes 1-5
    // Lecture VERTICALE du tableau FITASC : colonne = poste, lignes = ordre de tir
    // s = plateaux simples (machine), d = doublé(s) : objet ou tableau d'objets
    var CS_GRILLES = [
    // ── Grilles 1-8 : 5 Simples (5S) ──────────────────────────────
    // Grille 1
    [{s:['A','E','C','F','D'], d:[]}, {s:['B','F','D','A','E'], d:[]}, {s:['C','A','E','B','F'], d:[]}, {s:['D','B','F','C','A'], d:[]}, {s:['E','C','A','D','B'], d:[]}],
    // Grille 2
    [{s:['B','F','D','A','E'], d:[]}, {s:['C','A','E','B','F'], d:[]}, {s:['D','B','F','C','A'], d:[]}, {s:['E','C','A','D','B'], d:[]}, {s:['F','D','B','E','C'], d:[]}],
    // Grille 3
    [{s:['C','A','E','B','F'], d:[]}, {s:['D','B','F','C','A'], d:[]}, {s:['E','C','A','D','B'], d:[]}, {s:['F','D','B','E','C'], d:[]}, {s:['A','E','C','F','D'], d:[]}],
    // Grille 4
    [{s:['D','B','F','C','A'], d:[]}, {s:['E','C','A','D','B'], d:[]}, {s:['F','D','B','E','C'], d:[]}, {s:['A','E','C','F','D'], d:[]}, {s:['B','F','D','A','E'], d:[]}],
    // Grille 5
    [{s:['E','C','A','D','B'], d:[]}, {s:['F','D','B','E','C'], d:[]}, {s:['A','E','C','F','D'], d:[]}, {s:['B','F','D','A','E'], d:[]}, {s:['C','A','E','B','F'], d:[]}],
    // Grille 6
    [{s:['F','D','B','E','C'], d:[]}, {s:['A','E','C','F','D'], d:[]}, {s:['B','F','D','A','E'], d:[]}, {s:['C','A','E','B','F'], d:[]}, {s:['D','B','F','C','A'], d:[]}],
    // Grille 7
    [{s:['A','F','B','E','C'], d:[]}, {s:['C','A','D','B','E'], d:[]}, {s:['E','C','F','D','B'], d:[]}, {s:['B','D','A','F','C'], d:[]}, {s:['D','E','C','A','F'], d:[]}],
    // Grille 8
    [{s:['D','F','C','E','B'], d:[]}, {s:['B','A','F','C','E'], d:[]}, {s:['E','D','A','F','C'], d:[]}, {s:['C','B','D','A','F'], d:[]}, {s:['F','E','B','D','A'], d:[]}],
    // ── Grilles 9-16 : 3 Simples + 1 Coup de Fusil (3S+1CF) ──────
    // Grille 9
    [{s:['D','C','A'], d:{type:'CF', m:['B','F']}}, {s:['B','D','E'], d:{type:'CF', m:['F','A']}}, {s:['C','B','F'], d:{type:'CF', m:['A','E']}}, {s:['F','A','D'], d:{type:'CF', m:['E','C']}}, {s:['E','F','B'], d:{type:'CF', m:['C','D']}}],
    // Grille 10
    [{s:['B','E','C'], d:{type:'CF', m:['A','F']}}, {s:['D','B','E'], d:{type:'CF', m:['F','C']}}, {s:['A','D','B'], d:{type:'CF', m:['C','E']}}, {s:['F','A','D'], d:{type:'CF', m:['E','B']}}, {s:['C','F','A'], d:{type:'CF', m:['B','D']}}],
    // Grille 11
    [{s:['C','B','F'], d:{type:'CF', m:['D','A']}}, {s:['E','C','B'], d:{type:'CF', m:['A','F']}}, {s:['D','E','C'], d:{type:'CF', m:['F','B']}}, {s:['A','D','E'], d:{type:'CF', m:['B','C']}}, {s:['F','A','D'], d:{type:'CF', m:['C','E']}}],
    // Grille 12
    [{s:['B','E','D'], d:{type:'CF', m:['C','F']}}, {s:['D','B','E'], d:{type:'CF', m:['F','A']}}, {s:['C','F','B'], d:{type:'CF', m:['A','E']}}, {s:['A','C','F'], d:{type:'CF', m:['E','D']}}, {s:['E','A','C'], d:{type:'CF', m:['D','B']}}],
    // Grille 13
    [{s:['E','D','A'], d:{type:'CF', m:['F','C']}}, {s:['B','E','D'], d:{type:'CF', m:['C','A']}}, {s:['F','B','E'], d:{type:'CF', m:['A','D']}}, {s:['C','F','B'], d:{type:'CF', m:['D','E']}}, {s:['A','C','F'], d:{type:'CF', m:['E','B']}}],
    // Grille 14
    [{s:['F','A','C'], d:{type:'CF', m:['E','D']}}, {s:['C','F','B'], d:{type:'CF', m:['D','A']}}, {s:['E','B','D'], d:{type:'CF', m:['A','C']}}, {s:['B','E','A'], d:{type:'CF', m:['C','F']}}, {s:['D','C','E'], d:{type:'CF', m:['F','B']}}],
    // Grille 15
    [{s:['B','F','D'], d:{type:'CF', m:['E','A']}}, {s:['C','E','B'], d:{type:'CF', m:['A','D']}}, {s:['F','C','A'], d:{type:'CF', m:['D','B']}}, {s:['E','D','C'], d:{type:'CF', m:['B','F']}}, {s:['A','B','E'], d:{type:'CF', m:['F','C']}}],
    // Grille 16
    [{s:['B','D','F'], d:{type:'CF', m:['E','C']}}, {s:['E','A','D'], d:{type:'CF', m:['C','F']}}, {s:['C','B','A'], d:{type:'CF', m:['F','D']}}, {s:['A','E','C'], d:{type:'CF', m:['D','B']}}, {s:['F','C','E'], d:{type:'CF', m:['B','A']}}],
    // ── Grilles 17-24 : 3 Simples + 1 Simultané (3S+1SIM) ────────
    // Grille 17
    [{s:['F','D','A'], d:{type:'SIM', m:['B','C']}}, {s:['E','B','D'], d:{type:'SIM', m:['C','A']}}, {s:['C','F','E'], d:{type:'SIM', m:['A','D']}}, {s:['B','E','A'], d:{type:'SIM', m:['D','F']}}, {s:['A','C','B'], d:{type:'SIM', m:['F','E']}}],
    // Grille 18
    [{s:['A','D','F'], d:{type:'SIM', m:['E','B']}}, {s:['F','E','A'], d:{type:'SIM', m:['B','C']}}, {s:['E','B','D'], d:{type:'SIM', m:['C','A']}}, {s:['B','F','C'], d:{type:'SIM', m:['A','D']}}, {s:['C','A','E'], d:{type:'SIM', m:['D','F']}}],
    // Grille 19
    [{s:['A','C','F'], d:{type:'SIM', m:['D','B']}}, {s:['E','D','A'], d:{type:'SIM', m:['B','C']}}, {s:['D','A','E'], d:{type:'SIM', m:['C','F']}}, {s:['B','E','C'], d:{type:'SIM', m:['F','A']}}, {s:['F','B','D'], d:{type:'SIM', m:['A','E']}}],
    // Grille 20
    [{s:['D','E','A'], d:{type:'SIM', m:['F','C']}}, {s:['B','F','E'], d:{type:'SIM', m:['C','D']}}, {s:['A','C','B'], d:{type:'SIM', m:['D','E']}}, {s:['F','B','C'], d:{type:'SIM', m:['E','A']}}, {s:['C','D','F'], d:{type:'SIM', m:['A','B']}}],
    // Grille 21
    [{s:['C','D','B'], d:{type:'SIM', m:['A','E']}}, {s:['A','B','D'], d:{type:'SIM', m:['E','F']}}, {s:['B','A','C'], d:{type:'SIM', m:['F','D']}}, {s:['E','C','F'], d:{type:'SIM', m:['D','B']}}, {s:['F','E','A'], d:{type:'SIM', m:['B','C']}}],
    // Grille 22
    [{s:['C','D','F'], d:{type:'SIM', m:['E','A']}}, {s:['E','F','B'], d:{type:'SIM', m:['A','C']}}, {s:['B','A','D'], d:{type:'SIM', m:['C','E']}}, {s:['F','C','B'], d:{type:'SIM', m:['E','D']}}, {s:['A','B','E'], d:{type:'SIM', m:['D','F']}}],
    // Grille 23
    [{s:['C','E','B'], d:{type:'SIM', m:['A','D']}}, {s:['A','F','E'], d:{type:'SIM', m:['D','B']}}, {s:['F','C','D'], d:{type:'SIM', m:['B','E']}}, {s:['D','A','F'], d:{type:'SIM', m:['E','C']}}, {s:['B','D','A'], d:{type:'SIM', m:['C','F']}}],
    // Grille 24
    [{s:['D','B','F'], d:{type:'SIM', m:['A','C']}}, {s:['F','A','B'], d:{type:'SIM', m:['C','E']}}, {s:['A','D','C'], d:{type:'SIM', m:['E','B']}}, {s:['C','F','E'], d:{type:'SIM', m:['B','D']}}, {s:['E','C','A'], d:{type:'SIM', m:['D','F']}}],
    // ── Grilles 25-32 : 1 Simple + 2 Coup de Fusil (1S+2CF) ──────
    // Grille 25
    [{s:['C'], d:[{type:'CF', m:['D','B']}, {type:'CF', m:['F','A']}]}, {s:['E'], d:[{type:'CF', m:['B','F']}, {type:'CF', m:['A','D']}]}, {s:['A'], d:[{type:'CF', m:['F','C']}, {type:'CF', m:['D','E']}]}, {s:['F'], d:[{type:'CF', m:['C','A']}, {type:'CF', m:['E','B']}]}, {s:['D'], d:[{type:'CF', m:['A','F']}, {type:'CF', m:['B','C']}]}],
    // Grille 26
    [{s:['D'], d:[{type:'CF', m:['E','A']}, {type:'CF', m:['F','B']}]}, {s:['F'], d:[{type:'CF', m:['A','C']}, {type:'CF', m:['B','D']}]}, {s:['B'], d:[{type:'CF', m:['C','E']}, {type:'CF', m:['D','A']}]}, {s:['C'], d:[{type:'CF', m:['E','D']}, {type:'CF', m:['A','B']}]}, {s:['E'], d:[{type:'CF', m:['D','F']}, {type:'CF', m:['B','C']}]}],
    // Grille 27
    [{s:['A'], d:[{type:'CF', m:['E','F']}, {type:'CF', m:['B','C']}]}, {s:['B'], d:[{type:'CF', m:['F','D']}, {type:'CF', m:['C','A']}]}, {s:['C'], d:[{type:'CF', m:['D','E']}, {type:'CF', m:['A','F']}]}, {s:['D'], d:[{type:'CF', m:['E','A']}, {type:'CF', m:['F','C']}]}, {s:['E'], d:[{type:'CF', m:['A','B']}, {type:'CF', m:['C','D']}]}],
    // Grille 28
    [{s:['B'], d:[{type:'CF', m:['C','E']}, {type:'CF', m:['A','F']}]}, {s:['D'], d:[{type:'CF', m:['E','A']}, {type:'CF', m:['F','B']}]}, {s:['F'], d:[{type:'CF', m:['A','C']}, {type:'CF', m:['B','E']}]}, {s:['A'], d:[{type:'CF', m:['C','F']}, {type:'CF', m:['E','D']}]}, {s:['C'], d:[{type:'CF', m:['F','A']}, {type:'CF', m:['D','B']}]}],
    // Grille 29
    [{s:['E'], d:[{type:'CF', m:['C','D']}, {type:'CF', m:['A','B']}]}, {s:['A'], d:[{type:'CF', m:['D','F']}, {type:'CF', m:['B','C']}]}, {s:['D'], d:[{type:'CF', m:['F','A']}, {type:'CF', m:['C','E']}]}, {s:['B'], d:[{type:'CF', m:['A','D']}, {type:'CF', m:['E','F']}]}, {s:['C'], d:[{type:'CF', m:['D','A']}, {type:'CF', m:['F','B']}]}],
    // Grille 30
    [{s:['F'], d:[{type:'CF', m:['D','A']}, {type:'CF', m:['B','E']}]}, {s:['C'], d:[{type:'CF', m:['A','F']}, {type:'CF', m:['E','B']}]}, {s:['E'], d:[{type:'CF', m:['F','D']}, {type:'CF', m:['B','A']}]}, {s:['B'], d:[{type:'CF', m:['D','C']}, {type:'CF', m:['A','E']}]}, {s:['D'], d:[{type:'CF', m:['C','B']}, {type:'CF', m:['E','F']}]}],
    // Grille 31
    [{s:['A'], d:[{type:'CF', m:['C','D']}, {type:'CF', m:['E','B']}]}, {s:['F'], d:[{type:'CF', m:['D','E']}, {type:'CF', m:['B','A']}]}, {s:['D'], d:[{type:'CF', m:['E','C']}, {type:'CF', m:['A','F']}]}, {s:['B'], d:[{type:'CF', m:['C','A']}, {type:'CF', m:['F','D']}]}, {s:['C'], d:[{type:'CF', m:['A','E']}, {type:'CF', m:['D','B']}]}],
    // Grille 32
    [{s:['F'], d:[{type:'CF', m:['B','D']}, {type:'CF', m:['E','C']}]}, {s:['A'], d:[{type:'CF', m:['D','F']}, {type:'CF', m:['C','B']}]}, {s:['C'], d:[{type:'CF', m:['F','A']}, {type:'CF', m:['B','E']}]}, {s:['D'], d:[{type:'CF', m:['A','C']}, {type:'CF', m:['E','F']}]}, {s:['B'], d:[{type:'CF', m:['C','E']}, {type:'CF', m:['F','D']}]}],
    // ── Grilles 33-40 : 1 Simple + 2 Simultanés (1S+2SIM) ────────
    // Grille 33
    [{s:['D'], d:[{type:'SIM', m:['B','F']}, {type:'SIM', m:['C','E']}]}, {s:['C'], d:[{type:'SIM', m:['F','A']}, {type:'SIM', m:['E','D']}]}, {s:['F'], d:[{type:'SIM', m:['A','B']}, {type:'SIM', m:['D','C']}]}, {s:['A'], d:[{type:'SIM', m:['B','E']}, {type:'SIM', m:['C','F']}]}, {s:['B'], d:[{type:'SIM', m:['E','C']}, {type:'SIM', m:['F','D']}]}],
    // Grille 34
    [{s:['E'], d:[{type:'SIM', m:['A','C']}, {type:'SIM', m:['F','B']}]}, {s:['D'], d:[{type:'SIM', m:['C','F']}, {type:'SIM', m:['B','E']}]}, {s:['C'], d:[{type:'SIM', m:['F','A']}, {type:'SIM', m:['E','D']}]}, {s:['F'], d:[{type:'SIM', m:['A','B']}, {type:'SIM', m:['D','C']}]}, {s:['A'], d:[{type:'SIM', m:['B','F']}, {type:'SIM', m:['C','E']}]}],
    // Grille 35
    [{s:['B'], d:[{type:'SIM', m:['D','C']}, {type:'SIM', m:['F','A']}]}, {s:['F'], d:[{type:'SIM', m:['C','E']}, {type:'SIM', m:['A','B']}]}, {s:['A'], d:[{type:'SIM', m:['E','D']}, {type:'SIM', m:['B','F']}]}, {s:['E'], d:[{type:'SIM', m:['D','A']}, {type:'SIM', m:['F','C']}]}, {s:['D'], d:[{type:'SIM', m:['A','F']}, {type:'SIM', m:['C','E']}]}],
    // Grille 36
    [{s:['C'], d:[{type:'SIM', m:['F','E']}, {type:'SIM', m:['B','D']}]}, {s:['A'], d:[{type:'SIM', m:['E','B']}, {type:'SIM', m:['D','C']}]}, {s:['E'], d:[{type:'SIM', m:['B','F']}, {type:'SIM', m:['C','A']}]}, {s:['B'], d:[{type:'SIM', m:['F','D']}, {type:'SIM', m:['A','E']}]}, {s:['F'], d:[{type:'SIM', m:['D','B']}, {type:'SIM', m:['E','C']}]}],
    // Grille 37
    [{s:['F'], d:[{type:'SIM', m:['A','D']}, {type:'SIM', m:['E','C']}]}, {s:['E'], d:[{type:'SIM', m:['D','B']}, {type:'SIM', m:['C','A']}]}, {s:['D'], d:[{type:'SIM', m:['B','C']}, {type:'SIM', m:['A','E']}]}, {s:['B'], d:[{type:'SIM', m:['C','F']}, {type:'SIM', m:['E','D']}]}, {s:['A'], d:[{type:'SIM', m:['F','E']}, {type:'SIM', m:['D','B']}]}],
    // Grille 38
    [{s:['B'], d:[{type:'SIM', m:['C','D']}, {type:'SIM', m:['F','A']}]}, {s:['E'], d:[{type:'SIM', m:['D','F']}, {type:'SIM', m:['A','B']}]}, {s:['D'], d:[{type:'SIM', m:['F','C']}, {type:'SIM', m:['B','E']}]}, {s:['F'], d:[{type:'SIM', m:['C','A']}, {type:'SIM', m:['E','D']}]}, {s:['C'], d:[{type:'SIM', m:['A','F']}, {type:'SIM', m:['D','B']}]}],
    // Grille 39
    [{s:['C'], d:[{type:'SIM', m:['D','E']}, {type:'SIM', m:['B','F']}]}, {s:['B'], d:[{type:'SIM', m:['E','A']}, {type:'SIM', m:['F','C']}]}, {s:['E'], d:[{type:'SIM', m:['A','D']}, {type:'SIM', m:['C','B']}]}, {s:['A'], d:[{type:'SIM', m:['D','F']}, {type:'SIM', m:['B','E']}]}, {s:['D'], d:[{type:'SIM', m:['F','B']}, {type:'SIM', m:['E','C']}]}],
    // Grille 40
    [{s:['F'], d:[{type:'SIM', m:['C','A']}, {type:'SIM', m:['D','B']}]}, {s:['D'], d:[{type:'SIM', m:['A','E']}, {type:'SIM', m:['B','F']}]}, {s:['B'], d:[{type:'SIM', m:['E','C']}, {type:'SIM', m:['F','D']}]}, {s:['E'], d:[{type:'SIM', m:['C','F']}, {type:'SIM', m:['D','A']}]}, {s:['C'], d:[{type:'SIM', m:['F','D']}, {type:'SIM', m:['A','B']}]}]
];

    // Catégorie d'une grille CS (pour affichage)
    function csCategorieGrille(n) {
        if (n <= 8)  return '5 Simples';
        if (n <= 16) return '3S + 1CF';
        if (n <= 24) return '3S + 1SIM';
        if (n <= 32) return '1S + 2CF';
        return '1S + 2SIM';
    }

    /* =========================================================
       SÉCURITÉ — SANITISATION XSS
    ========================================================= */
    function sanitize(str) {
        const d = document.createElement('div');
        d.textContent = String(str ?? '');
        return d.innerHTML;
    }

    /* =========================================================
       WAKE LOCK API (Garder l'écran allumé)
    ========================================================= */
    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                wakeLock.addEventListener('release', () => {
                    console.log('Wake Lock libéré');
                });
            } catch (err) {
                console.log('Wake Lock erreur:', err);
            }
        }
    }

    function releaseWakeLock() {
        if (wakeLock !== null) {
            wakeLock.release();
            wakeLock = null;
        }
    }

    /* =========================================================
       SAUVEGARDE TEMP (localStorage)
    ========================================================= */
    function sauvegarderSerieTemp() {
        const temp = {
            tireur: currentTireur,
            disc: currentDisc,
            poste: currentPoste,
            serie: serieEnCours,
            directions: directionsEnCours,
            vent: currentVent,
            meteoAPI: currentMeteoAPI,
            // PCH/CS : sauvegarder l'état du menu
            menuPCH: _menuPCH,
            indexMenu: _indexMenu,
            lignePCH: _lignePCH,
            // CS : sauvegarder la catégorie et la grille
            csGrilleNum: _csGrilleNum,
            noBirdCount: _noBirdCount
        };
        localStorage.setItem(TEMP_KEY, JSON.stringify(temp));
    }

    function effacerSerieTemp() {
        localStorage.removeItem(TEMP_KEY);
    }

    function verifierSerieTemp() {
        const temp = localStorage.getItem(TEMP_KEY);
        if (temp) {
            try {
                const parsed = JSON.parse(temp);
                if (parsed && parsed.serie && parsed.serie.length > 0) {
                    showConfirm("Une série non terminée a été trouvée. Voulez-vous la reprendre ?", (ok) => {
                        if (ok) {
                            reprendreCoaching(parsed);
                        } else {
                            effacerSerieTemp();
                        }
                    });
                }
            } catch(e) { effacerSerieTemp(); }
        }
    }

    function reprendreCoaching(data) {
        currentTireur = data.tireur;
        currentDisc = data.disc;
        currentPoste = data.poste;
        currentVent = data.vent || 'faible';
        currentMeteoAPI = data.meteoAPI || null;
        serieEnCours = data.serie || [];
        directionsEnCours = data.directions || [];

        // PCH/CS : restaurer l'état du menu
        _menuPCH = data.menuPCH || [];
        _indexMenu = data.indexMenu || 0;
        _lignePCH = data.lignePCH || 5;
        _noBirdCount = data.noBirdCount || 0;
        // CS : restaurer catégorie et grille
        if (data.csGrilleNum) _csGrilleNum = data.csGrilleNum;

        document.getElementById('note-coach').value = "";
        if(typeof annulerDirection === 'function') annulerDirection();
        setVent(currentVent);
        if (!currentMeteoAPI) chargerMeteoDynamique();

        const posteLabel = currentPoste ? ' · P' + currentPoste : '';
        const grilleLabel = (currentDisc === 'CS' && _csGrilleNum) ? ' · G' + _csGrilleNum : '';
        document.getElementById('badge-tir').textContent = currentTireur + " | " + currentDisc + posteLabel + grilleLabel;

        const g = document.getElementById('grid-25');
        g.innerHTML = "";
        for (let i = 1; i <= 25; i++) {
            const t = document.createElement('div');
            t.style.cssText = 'width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:900;color:var(--text-muted);background:var(--bg);box-shadow:2px 2px 5px var(--shadow-dark),-2px -2px 5px var(--shadow-light);flex-shrink:0;';
            t.textContent = calculerPoste(i, currentDisc, currentPoste);
            g.appendChild(t);
        }

        updateTirUI();
        switchTab('page-tir', null);
    }

    /* =========================================================
       IndexedDB — Storage Manager
       TOUT dans IndexedDB — plus aucune donnée critique en localStorage
       ObjectStores :
         - main : Données principales (keyPath: 'key', 1 seule ligne key='db')
         - coach : Profil coach (keyPath: 'key', 1 seule ligne key='profile')
         - settings : Paramètres UI (keyPath: 'key', 1 seule ligne key='ui')
    ========================================================= */
    var idb = null; // Référence IndexedDB

    function openIDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = (e) => {
                const d = e.target.result;
                if (!d.objectStoreNames.contains('main')) {
                    d.createObjectStore('main', { keyPath: 'key' });
                }
                if (!d.objectStoreNames.contains('coach')) {
                    d.createObjectStore('coach', { keyPath: 'key' });
                }
                if (!d.objectStoreNames.contains('settings')) {
                    d.createObjectStore('settings', { keyPath: 'key' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function idbGet(storeName, key) {
        return new Promise((resolve, reject) => {
            const tx = idb.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function idbPut(storeName, data) {
        return new Promise((resolve, reject) => {
            const tx = idb.transaction(storeName, 'readwrite');
            const req = tx.objectStore(storeName).put(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function getEmptyDB() {
        return { version: 1, iaVersion: IA_VERSION, eleves: {}, profils: {}, eleveInfo: {}, arsenal: [], activeComps: {}, archivesComps: {} };
    }

    function validateDB(data) {
        if (!data || typeof data !== 'object') return false;
        if (!data.eleves || typeof data.eleves !== 'object' || Array.isArray(data.eleves)) return false;
        for (const k of Object.keys(data.eleves)) {
            if (!Array.isArray(data.eleves[k])) return false;
        }
        return true;
    }

    // saveDB() → persiste db dans IndexedDB (store 'main', key='db')
    function saveDB() {
        if (!idb) {
            // Fallback localStorage si IndexedDB pas encore prêt
            try { localStorage.setItem('BALLTRAP_FINAL_DB', JSON.stringify(db)); } catch(e) {}
            return;
        }
        idbPut('main', { key: 'db', data: db }).catch(err => {
            console.error('Erreur sauvegarde IndexedDB:', err);
            showToast('Erreur de sauvegarde.', 'error');
        });
    }

    // Migration localStorage → IndexedDB (une seule fois)
    async function migrateFromLocalStorage() {
        if (!idb) return;

        // 1. Données principales
        const rawDB = localStorage.getItem('BALLTRAP_FINAL_DB');
        if (rawDB) {
            try {
                const parsed = JSON.parse(rawDB);
                if (validateDB(parsed)) {
                    if (!parsed.profils) parsed.profils = {};
                    if (!parsed.activeComps) parsed.activeComps = {};
                    if (!parsed.archivesComps) parsed.archivesComps = {};
                    await idbPut('main', { key: 'db', data: parsed });
                    console.log('📦 Migration: données principales → IndexedDB');
                }
            } catch(e) { console.warn('Migration DB échouée:', e); }
        }

        // 2. Profil coach
        const rawCoach = localStorage.getItem('BALLTRAP_COACH_PROFILE');
        if (rawCoach) {
            try {
                const coachData = JSON.parse(rawCoach);
                await idbPut('coach', { key: 'profile', data: coachData });
                console.log('📦 Migration: profil coach → IndexedDB');
            } catch(e) { console.warn('Migration coach échouée:', e); }
        }

        // 3. Paramètres
        const rawParams = localStorage.getItem('BALLTRAP_PARAMS');
        if (rawParams) {
            try {
                const paramsData = JSON.parse(rawParams);
                await idbPut('settings', { key: 'ui', data: paramsData });
                console.log('📦 Migration: paramètres → IndexedDB');
            } catch(e) { console.warn('Migration params échouée:', e); }
        }
    }

    // Nettoyage des élèves fantômes (tableau vide sans info)
    function purgerElevesFantomes() {
        let purged = 0;
        Object.keys(db.eleves).forEach(nom => {
            const series = db.eleves[nom];
            const info = db.eleveInfo && db.eleveInfo[nom];
            const disciplines = info && info.disciplines && info.disciplines.length > 0;
            // Fantôme = tableau vide ET pas de disciplines pré-assignées
            if ((!series || series.length === 0) && !disciplines) {
                delete db.eleves[nom];
                delete db.profils[nom];
                if (db.eleveInfo) delete db.eleveInfo[nom];
                if (db.analysesCoach) delete db.analysesCoach[nom];
                if (db.activeComps) delete db.activeComps[nom];
                if (db.archivesComps) delete db.archivesComps[nom];
                purged++;
            }
        });
        if (purged > 0) {
            console.log('🧹 ' + purged + ' élève(s) fantôme(s) purgé(s)');
            saveDB();
        }
    }

    // Recherche insensible à la casse d'un élève existant
    function trouverEleveParNom(nom) {
        const nomLC = nom.trim().toLowerCase();
        const keys = Object.keys(db.eleves);
        // D'abord correspondance exacte
        if (keys.includes(nom.trim())) return nom.trim();
        // Puis insensible à la casse
        const found = keys.find(k => k.toLowerCase() === nomLC);
        return found || null;
    }

    // Initialisation IndexedDB + chargement en mémoire
    async function initIDB() {
        try {
            idb = await openIDB();

            // Migration auto depuis localStorage (1ère fois)
            if (!localStorage.getItem(MIGRATION_KEY)) {
                await migrateFromLocalStorage();
                localStorage.setItem(MIGRATION_KEY, 'true');
                console.log('✅ Migration complète localStorage → IndexedDB');
            }

            // Charger les données principales en mémoire
            const mainRow = await idbGet('main', 'db');
            if (mainRow && mainRow.data && validateDB(mainRow.data)) {
                db = mainRow.data;
                if (!db.profils) db.profils = {};
                if (!db.eleveInfo) db.eleveInfo = {};
                if (!db.activeComps) db.activeComps = {};
                if (!db.archivesComps) db.archivesComps = {};
                if (!db.arsenal) db.arsenal = [];
                // Migration : fusils par élève → pool global
                if (db.eleveInfo) {
                    Object.keys(db.eleveInfo).forEach(nom => {
                        const info = db.eleveInfo[nom];
                        if (info.fusils && Array.isArray(info.fusils) && info.fusils.length > 0) {
                            info.fusils.forEach(f => {
                                // Ajouter uniquement si pas déjà dans l'arsenal (par nom)
                                if (!db.arsenal.some(a => a.nom === f.nom && a.type === f.type)) {
                                    db.arsenal.push({ ...f, id: 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) });
                                }
                            });
                            // Mémoriser le fusil par défaut pour cet élève (par ID)
                            if (info.fusilActif !== undefined && info.fusilActif >= 0 && info.fusilActif < info.fusils.length) {
                                const fDef = info.fusils[info.fusilActif];
                                const match = db.arsenal.find(a => a.nom === fDef.nom && a.type === fDef.type);
                                if (match) info.fusilId = match.id;
                            }
                            delete info.fusils;
                            delete info.fusilActif;
                        }
                    });
                    saveDB();
                }
            } else {
                db = getEmptyDB();
            }

            // Purger les élèves fantômes (tableau vide, pas de disciplines)
            purgerElevesFantomes();

            return true;
        } catch(err) {
            console.error('❌ Erreur init IndexedDB:', err);
            // Fallback: essayer localStorage
            try {
                const raw = localStorage.getItem('BALLTRAP_FINAL_DB');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (validateDB(parsed)) {
                        db = parsed;
                        if (!db.profils) db.profils = {};
                        if (!db.eleveInfo) db.eleveInfo = {};
                        if (!db.activeComps) db.activeComps = {};
                        if (!db.archivesComps) db.archivesComps = {};
                        if (!db.arsenal) db.arsenal = [];
                    }
                }
            } catch(e) {}
            return false;
        }
    }

    /* =========================================================
       TOAST (remplace alert)
    ========================================================= */
    function showToast(msg, type) {
        type = type || 'info';
        const colors = { success: '#2ecc71', error: '#e66756', info: 'var(--accent)' };
        const t = document.createElement('div');
        t.className = 'toast';
        t.style.background = colors[type] || colors.info;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }

    /* =========================================================
       MODALE CONFIRMATION (remplace confirm())
    ========================================================= */
    var _confirmCallback = null;
    function showConfirm(msg, cb, actionText = 'SUPPRIMER', actionColor = 'var(--r-color)') {
        document.getElementById('confirm-msg').textContent = msg;
        const btnAction = document.getElementById('btn-confirm-action');
        if (btnAction) {
            btnAction.textContent = actionText;
            btnAction.style.background = actionColor;
        }
        document.getElementById('modal-confirm').style.display = 'flex';
        _confirmCallback = cb;
    }
    function repondreConfirm(ok) {
        document.getElementById('modal-confirm').style.display = 'none';
        if (_confirmCallback) { _confirmCallback(ok); _confirmCallback = null; }
    }

    /* =========================================================
       MODALE IMPORT (remplace prompt())
    ========================================================= */
    function ouvrirImport() {
        document.getElementById('import-file-name').textContent = 'Choisir un fichier...';
        document.getElementById('import-file-input').value = '';
        document.getElementById('btn-valider-import').style.opacity = '0.4';
        document.getElementById('btn-valider-import').disabled = true;
        document.getElementById('modal-import').style.display = 'flex';
    }
    function fermerImport() {
        document.getElementById('modal-import').style.display = 'none';
    }
    function previewImportFile(input) {
        const file = input.files[0];
        if (!file) return;
        document.getElementById('import-file-name').textContent = file.name;
        document.getElementById('btn-valider-import').style.opacity = '1';
        document.getElementById('btn-valider-import').disabled = false;
    }
    function validerImport() {
        const input = document.getElementById('import-file-input');
        const file  = input.files[0];
        if (!file) { showToast('Sélectionnez un fichier.', 'error'); return; }
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const parsed = JSON.parse(e.target.result);
                if (!validateDB(parsed)) throw new Error('Schéma invalide');
                db = parsed;
                if (!db.profils) db.profils = {};
                if (!db.activeComps) db.activeComps = {};
                if (!db.archivesComps) db.archivesComps = {};
                saveDB();
                fermerImport();
                showToast('Données importées !', 'success');
                renderEleves();
            } catch(err) {
                showToast('Fichier invalide. Vérifiez le format JSON.', 'error');
            }
        };
        reader.readAsText(file);
    }

    /* =========================================================
       INIT
    ========================================================= */
    window.onload = async function() {
        await initIDB();
        await loadCoachAsync();
        await loadParamsAsync();
        // 🎯 Purger les analyses sauvegardées si la version IA a changé
        if (db.iaVersion !== IA_VERSION) {
            db.analysesCoach = {};
            db.iaVersion = IA_VERSION;
            saveDB();
        }
        appliquerParamsAuDemarrage();
        chargerThemeSoleil(); // <-- LECTURE DU MODE SOLEIL
        renderEleves();
    };

    /* =========================================================
       NAVIGATION
    ========================================================= */
    function entrerApp() {
        const p0 = document.getElementById('page-0');
        const nav = document.getElementById('main-nav');
        const fabReglages = document.getElementById('btn-reglages');
        const fabTheme = document.getElementById('btn-theme-cycle');
        p0.classList.add('hidden');
        setTimeout(() => { 
            p0.style.display = 'none'; 
            nav.style.display = 'flex';
            fabReglages.style.display = 'flex';
            fabTheme.style.display = 'flex';
            updateThemeIcon();
            // Si le coach n'est pas configuré → page-coach, sinon → Élèves
            const coachData = loadCoach();
            if (!coachData || (!coachData.nom && !coachData.prenom)) {
                switchTab('page-coach', null);
            } else {
                switchTab('page-eleves', document.querySelector('[data-page="page-eleves"]'));
            }
            verifierSerieTemp(); 
        }, 600);
    }

    function switchTab(id, el) {
        document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
        document.getElementById(id).style.display = 'flex';
        
        // Gestion du Wake Lock
        if (id === 'page-tir') {
            requestWakeLock();
        } else {
            releaseWakeLock();
        }

        // Mise à jour onglet actif dans la bottom-nav
        if (el) {
            document.querySelectorAll('.bottom-nav .tab-item').forEach(t => t.classList.remove('active'));
            el.classList.add('active');
        }
        // Pages principales — mise à jour auto de l'onglet actif
        const mainTabs = ['page-eleves', 'page-coaching', 'page-historique', 'page-stats', 'page-analyse'];
        if (mainTabs.includes(id)) {
            document.querySelectorAll('.bottom-nav .tab-item').forEach(t => {
                t.classList.toggle('active', t.dataset.page === id);
            });
        }
        // Sous-pages : on garde l'onglet parent actif
        const parentTabMap = {
            'page-coach': 'page-params',
            'page-params': 'page-params',
            'page-fiche-eleve': 'page-eleves',
            'page-tir': 'page-coaching'
        };
        if (parentTabMap[id]) {
            document.querySelectorAll('.bottom-nav .tab-item').forEach(t => {
                t.classList.toggle('active', t.dataset.page === parentTabMap[id]);
            });
        }

        if (id === 'page-eleves') { renderEleves(); updateBandeauEleveActif(); }
        if (id === 'page-coaching') { renderCoaching(); }
        if (id === 'page-historique') { renderHistorique(); }
        if (id === 'page-stats') { renderStats(); }
        if (id === 'page-analyse') { renderAnalyse(); }
        if (id === 'page-fiche-eleve') refreshFicheEleve();
        if (id === 'page-coach') chargerCoach();
        if (id === 'page-params') {
            const p = loadParams();
            document.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('active', d.dataset.color === p.theme));
            // Mettre à jour le toggle dark mode
            const cbDark = document.getElementById('checkbox-dark');
            if (cbDark) cbDark.checked = document.documentElement.classList.contains('dark-mode');
        }
    }

    /* =========================================================
       PROFIL COACH — Sauvegarde / Chargement (IndexedDB)
    ========================================================= */
    const COACH_KEY_LS = 'BALLTRAP_COACH_PROFILE'; // Ancien clé localStorage (migration)

    function getEmptyCoach() {
        return { nom: '', prenom: '', club: '', tel: '', email: '', licence: '', calibre: '12', lateralite: 'droitier', grade: '' };
    }

    // Cache mémoire du coach
    var _coachCache = null;

    async function loadCoachAsync() {
        if (!idb) {
            // Fallback localStorage
            try {
                const d = localStorage.getItem(COACH_KEY_LS);
                return d ? JSON.parse(d) : getEmptyCoach();
            } catch { return getEmptyCoach(); }
        }
        try {
            const row = await idbGet('coach', 'profile');
            _coachCache = (row && row.data) ? row.data : getEmptyCoach();
            return _coachCache;
        } catch { return getEmptyCoach(); }
    }

    // Synchronous accessor for backward compat (returns cached or empty)
    function loadCoach() {
        return _coachCache || getEmptyCoach();
    }

    async function sauvegarderCoachAsync() {
        const coach = {
            nom: document.getElementById('coach-nom').value.trim(),
            prenom: document.getElementById('coach-prenom').value.trim(),
            club: document.getElementById('coach-club').value.trim(),
            tel: document.getElementById('coach-tel').value.trim(),
            email: document.getElementById('coach-email').value.trim(),
            licence: document.getElementById('coach-licence').value.trim(),
            calibre: document.querySelector('[data-cal].active')?.dataset.cal || '12',
            lateralite: document.querySelector('[data-lat].active')?.dataset.lat || 'droitier',
            grade: document.querySelector('[data-grade].active')?.dataset.grade || ''
        };
        _coachCache = coach;
        if (idb) {
            await idbPut('coach', { key: 'profile', data: coach });
        } else {
            try { localStorage.setItem(COACH_KEY_LS, JSON.stringify(coach)); } catch(e) {}
        }
    }

    // Sync wrapper for inline onclick handlers
    function sauvegarderCoach() {
        sauvegarderCoachAsync();
    }

    function chargerCoach() {
        const c = loadCoach();
        document.getElementById('coach-nom').value = c.nom || '';
        document.getElementById('coach-prenom').value = c.prenom || '';
        document.getElementById('coach-club').value = c.club || '';
        document.getElementById('coach-tel').value = c.tel || '';
        document.getElementById('coach-email').value = c.email || '';
        document.getElementById('coach-licence').value = c.licence || '';
        // Grade
        document.querySelectorAll('[data-grade]').forEach(b => b.classList.toggle('active', b.dataset.grade === (c.grade || '')));
        // Calibre
        document.querySelectorAll('[data-cal]').forEach(b => b.classList.toggle('active', b.dataset.cal === (c.calibre || '12')));
        // Latéralité
        document.querySelectorAll('[data-lat]').forEach(b => b.classList.toggle('active', b.dataset.lat === (c.lateralite || 'droitier')));
    }

    // Valider le profil coach → redirige vers Élèves (1er lancement) ou Réglages
    var _coachOriginPage = 'page-eleves'; // page de retour après validation coach
    function validerCoach() {
        const licence = document.getElementById('coach-licence').value.trim();
        if (!licence) {
            showToast('N° licence FFBT obligatoire', 'error');
            document.getElementById('coach-licence').focus();
            return;
        }
        sauvegarderCoach();
        const targetPage = _coachOriginPage;
        const tabEl = document.querySelector('[data-page="' + targetPage + '"]');
        switchTab(targetPage, tabEl);
        showToast('Profil coach enregistré', 'success');
    }

    function selectGrade(btn) {
        const wasActive = btn.classList.contains('active');
        document.querySelectorAll('[data-grade]').forEach(b => b.classList.remove('active'));
        if (!wasActive) btn.classList.add('active');
        sauvegarderCoach();
    }

    function fermerModal() { document.getElementById('modal-disc').style.display = 'none'; }
    function fermerModalPoste() {
        document.getElementById('modal-poste').style.display = 'none';
        currentPoste = null;
    }

    function selectionnerDisc(d) {
        currentDisc = d; fermerModal();
        const labels = { 'FU': 'Fosse Universelle', 'DTL': 'Fosse DTL', 'TRAP 1': 'Trap 1', 'PCH': 'Parcours de Chasse', 'CS': 'Compak Sporting' };
        document.getElementById('modal-poste-disc').textContent = labels[d] || d;
        // PCH/CS : adapter le nombre de postes dans la modale
        const gridPostes = document.querySelector('#modal-poste .modal-box > div[style*="grid"]');
        if (gridPostes) {
            const nbPostes = (d === 'CS') ? 5 : (DISC_DOUBLES.includes(d) ? _lignePCH : 5);
            gridPostes.innerHTML = '';
            for (let p = 1; p <= nbPostes; p++) {
                const btn = document.createElement('button');
                btn.className = 'btn-poste' + (p === 1 ? ' active' : '');
                btn.textContent = p;
                btn.onclick = function() { selectionnerPoste(p); };
                gridPostes.appendChild(btn);
            }
        }
        document.getElementById('modal-poste').style.display = 'flex';
    }

    function selectionnerPoste(p) {
        currentPoste = p;
        // Retour visuel : accent sur le bouton cliqué
        document.querySelectorAll('#modal-poste .btn-poste').forEach(b => b.classList.remove('active'));
        const btns = document.querySelectorAll('#modal-poste .btn-poste');
        if (btns[p - 1]) btns[p - 1].classList.add('active');
        // Petit délai pour que l'utilisateur voie l'accent avant la fermeture
        setTimeout(() => {
            document.getElementById('modal-poste').style.display = 'none';
            lancerCoaching(currentDisc);
        }, 150);
    }

    /* =========================================================
       MODE COMPÉTITION (Logique visuelle)
    ========================================================= */
    var currentModeComp = 0; // 0 = Normal, 100 ou 200

    function choisirModeComp(mode) {
        currentModeComp = mode;
        
        // On réinitialise tous les gros boutons en gris transparent
        const btns = [0, 100, 200];
        btns.forEach(b => {
            const el = document.getElementById('btn-mode-' + b);
            if (el) {
                el.style.background = 'transparent';
                el.style.color = 'var(--text-muted)';
                el.style.boxShadow = 'none';
            }
        });
        
        // On allume le bouton cliqué avec l'ombre ajustée pour sa grande taille
        const btnActif = document.getElementById('btn-mode-' + mode);
        if (btnActif) {
            btnActif.style.background = 'var(--accent)';
            btnActif.style.color = 'white';
            btnActif.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
        }
    }

    function annulerCompetitionEnCours() {
        showConfirm("Annuler la compétition en cours ? Les séries déjà tirées resteront dans l'historique normal.", (ok) => {
            if (ok) {
                if (db.activeComps && db.activeComps[currentTireur]) {
                    delete db.activeComps[currentTireur];
                    saveDB();
                }
                showToast("Compétition annulée.", "info");
                refreshFicheEleve(); // Magie : ça recharge la vue et remet les gros boutons !
            }
        });
    }

    /* =========================================================
       ÉLÈVES
    ========================================================= */
    // Helpers sélection modale ajout
    function selectAjoutProfil(btn) {
        document.querySelectorAll('#ajout-profil [data-eprof]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    function selectAjoutCalibre(btn) {
        document.querySelectorAll('#ajout-calibre [data-ecal]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    function selectAjoutLateralite(btn) {
        document.querySelectorAll('#ajout-lateralite [data-elat]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    function toggleDiscAjout(btn) {
        btn.classList.toggle('active');
    }
    function toggleDiscEdit(btn) {
        btn.classList.toggle('active');
    }
    function toggleDiscFiche(btn) {
        if (!currentTireur) return;
        const disc = btn.dataset.disc;
        const wasActive = btn.classList.contains('active');

        if (wasActive) {
            // Décocher → vérifier qu'il n'y a pas de séries existantes
            const scores = db.eleves[currentTireur] || [];
            const seriesDisc = scores.filter(s => s.disc === disc);
            if (seriesDisc.length > 0) {
                showToast('Impossible : ' + seriesDisc.length + ' série' + (seriesDisc.length > 1 ? 's' : '') + ' existante' + (seriesDisc.length > 1 ? 's' : '') + ' en ' + disc + '.', 'error');
                return; // Ne pas décocher
            }
            // Retirer la discipline du eleveInfo
            if (db.eleveInfo && db.eleveInfo[currentTireur] && db.eleveInfo[currentTireur].disciplines) {
                db.eleveInfo[currentTireur].disciplines = db.eleveInfo[currentTireur].disciplines.filter(d => d !== disc);
            }
            btn.classList.remove('active');
            showToast(disc + ' retiré' + (disc === 'FU' ? 'e' : '') + ' des disciplines.', 'info');
        } else {
            // Cocher → ajouter la discipline
            btn.classList.add('active');
            // Feedback visuel immédiat (accent)
            if (!db.eleveInfo) db.eleveInfo = {};
            if (!db.eleveInfo[currentTireur]) db.eleveInfo[currentTireur] = { calibre: '12', lateralite: 'droitier', tel: '', email: '', licence: '', club: '', disciplines: [] };
            if (!db.eleveInfo[currentTireur].disciplines) db.eleveInfo[currentTireur].disciplines = [];
            if (!db.eleveInfo[currentTireur].disciplines.includes(disc)) {
                db.eleveInfo[currentTireur].disciplines.push(disc);
            }
            showToast(disc + ' ajouté' + (disc === 'FU' ? 'e' : '') + ' aux disciplines !', 'success');
        }

        saveDB();
        renderEleves(); // Mettre à jour l'affichage dans la liste élèves
    }
    function viderEleveActif() {
        _eleveActif = null;
        updateBandeauEleveActif();
        renderEleves();
    }
    function updateBandeauEleveActif() {
        const bandeau = document.getElementById('bandeau-eleve-actif');
        if (!bandeau) return;
        if (_eleveActif && _eleveActif.nom) {
            bandeau.style.display = 'flex';
            document.getElementById('bandeau-nom').textContent = _eleveActif.nom;
            document.getElementById('bandeau-disc').textContent = _eleveActif.disc;
        } else {
            bandeau.style.display = 'none';
        }
    }
    function getDiscsEleve(nom) {
        // Retourne les disciplines d'un élève : pré-assignées + celles avec au moins 1 série
        const discs = new Set();
        // Pré-assignées (stockées dans eleveInfo)
        if (db.eleveInfo && db.eleveInfo[nom] && db.eleveInfo[nom].disciplines) {
            db.eleveInfo[nom].disciplines.forEach(d => discs.add(d));
        }
        // Séries existantes
        const series = db.eleves[nom] || [];
        series.forEach(s => { if (s.disc) discs.add(s.disc); });
        return [...discs];
    }

    /* =========================================================
       PAGE COACHING — Logique de la page
    ========================================================= */
    var _coachingPoste = 1;
    var _coachingMode = 0; // 0=Entraînement, 100, 200

    function renderCoaching() {
        const container = document.getElementById('coaching-eleve-container');
        if (!container) return;

        if (_eleveActif && _eleveActif.nom) {
            // Élève sélectionné → carte active
            const disc = _eleveActif.disc;
            const DISC_LABELS = { 'FU': 'Fosse Universelle', 'DTL': 'Fosse DTL', 'TRAP 1': 'Trap 1', 'PCH': 'Parcours de Chasse', 'CS': 'Compak Sporting' };
            const profil = db.profils[_eleveActif.nom] || 'Confirmé';
            const info = db.eleveInfo[_eleveActif.nom] || {};
            
            // Compter les séries dans cette discipline
            const series = (db.eleves[_eleveActif.nom] || []).filter(s => s.disc === disc);
            const nbSeries = series.length;
            const avgPct = nbSeries > 0 ? Math.round(series.reduce((a, s) => a + parseInt(s.score) / maxParSerie(s.disc) * 100, 0) / nbSeries) : 0;
            
            container.innerHTML = `
                <div class="coaching-eleve-card">
                    <div class="coaching-eleve-nom">${sanitize(_eleveActif.nom)}</div>
                    <div class="coaching-eleve-disc">${DISC_LABELS[disc] || disc}</div>
                    <div class="coaching-eleve-info">${profil} · ${nbSeries} série${nbSeries !== 1 ? 's' : ''} · moy. ${avgPct}%</div>
                </div>
            `;
            // Activer le bouton lancer
            document.getElementById('btn-lancer-coaching').disabled = false;
            // Afficher/masquer les sélecteurs PCH selon la discipline
            updateCoachingPCHSelectors(disc);
        } else {
            // Pas d'élève → carte vide
            container.innerHTML = `
                <div class="coaching-vide-card">
                    <div class="coaching-vide-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg></div>
                    <div class="coaching-vide-text">Sélectionnez un élève pour commencer une séance de coaching.</div>
                    <button class="btn-main" onclick="switchTab('page-eleves', null)">Choisir un élève</button>
                </div>
            `;
            document.getElementById('btn-lancer-coaching').disabled = true;
        }

        // Mettre à jour le tracker de compétition en cours
        updateCoachingCompTracker();
        // Mettre à jour la tuile fusil
        updateCoachingFusil();
    }

    // ---- ARSENAL — Pool global de fusils (page Coaching) ----
    var _coachingFusilId = ''; // ID du fusil sélectionné dans le pool

    function updateCoachingFusil() {
        const card = document.getElementById('coaching-fusil-card');
        if (!card) return;

        // Toujours afficher la carte Fusil (même si pas d'élève, pour gérer le pool)
        card.style.display = 'block';

        // Pré-sélectionner le fusil par défaut de l'élève actif
        if (_eleveActif && _eleveActif.nom) {
            const info = db.eleveInfo[_eleveActif.nom] || {};
            if (info.fusilId && db.arsenal.some(f => f.id === info.fusilId)) {
                _coachingFusilId = info.fusilId;
            } else if (db.arsenal.length > 0) {
                _coachingFusilId = db.arsenal[0].id;
            } else {
                _coachingFusilId = '';
            }
        } else {
            if (db.arsenal.length > 0) {
                _coachingFusilId = db.arsenal[0].id;
            } else {
                _coachingFusilId = '';
            }
        }

        renderCoachingFusilDropdown();
        updateCoachingChokeDisplay();
    }

    function renderCoachingFusilDropdown() {
        const container = document.getElementById('coaching-fusil-options');
        const textEl = document.getElementById('coaching-fusil-text');
        if (!container || !textEl) return;

        const arsenal = db.arsenal || [];
        container.innerHTML = '';

        if (arsenal.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:14px;text-align:center;font-size:0.85rem;color:var(--text-muted);font-weight:600;';
            empty.textContent = 'Aucun fusil enregistré';
            container.appendChild(empty);
            textEl.textContent = '-- Aucun fusil --';
            return;
        }

        arsenal.forEach(f => {
            const opt = document.createElement('div');
            opt.style.cssText = 'padding:10px 14px;border-radius:var(--radius-sm);font-weight:700;cursor:pointer;transition:all 0.2s;margin-bottom:3px;';
            let chokeLabel = '';
            if (f.chokeType === 'fixes') {
                const c1 = f.chokeCanon1 ? f.chokeCanon1.split(' (')[0] : '—';
                const c2 = f.chokeCanon2 ? f.chokeCanon2.split(' (')[0] : '—';
                chokeLabel = ' · ' + c1 + '/' + c2;
            } else {
                chokeLabel = ' · Amovibles';
            }
            opt.innerHTML = '<div>' + sanitize(f.nom) + '</div><div style="font-size:0.7rem;color:var(--text-muted);font-weight:600;">' + (f.type || '') + chokeLabel + '</div>';
            opt.dataset.fid = f.id;
            opt.onmouseenter = function() { this.style.background = 'var(--accent)'; this.style.color = 'white'; };
            opt.onmouseleave = function() { if (this.dataset.fid !== _coachingFusilId) { this.style.background = ''; this.style.color = ''; } };
            opt.onclick = function() { selectCoachingFusil(this.dataset.fid); };
            if (f.id === _coachingFusilId) { opt.style.background = 'rgba(243,156,18,0.15)'; opt.style.color = 'var(--accent)'; }
            container.appendChild(opt);
        });
    }

    function toggleCoachingFusilDropdown() {
        const opts = document.getElementById('coaching-fusil-options');
        if (!opts) return;
        opts.style.display = (opts.style.display === 'block') ? 'none' : 'block';
    }

    function selectCoachingFusil(fid) {
        _coachingFusilId = fid;
        // Mémoriser ce fusil comme préféré pour l'élève actif
        if (_eleveActif && _eleveActif.nom) {
            if (!db.eleveInfo[_eleveActif.nom]) db.eleveInfo[_eleveActif.nom] = {};
            db.eleveInfo[_eleveActif.nom].fusilId = fid;
            saveDB();
        }
        // Fermer dropdown
        document.getElementById('coaching-fusil-options').style.display = 'none';
        renderCoachingFusilDropdown();
        updateCoachingChokeDisplay();
    }

    function updateCoachingChokeDisplay() {
        const textEl = document.getElementById('coaching-fusil-text');
        const fixesDiv = document.getElementById('coaching-choke-fixes');
        const amovDiv = document.getElementById('coaching-choke-amovibles');
        const fixesText = document.getElementById('coaching-choke-fixes-text');
        const btnDel = document.getElementById('btn-supprimer-fusil');

        const arsenal = db.arsenal || [];
        const f = arsenal.find(g => g.id === _coachingFusilId);

        if (f) {
            textEl.textContent = f.nom;
            if (btnDel) { btnDel.style.display = 'inline-flex'; btnDel.style.opacity = '0.5'; }
            if (f.chokeType === 'fixes') {
                const c1 = f.chokeCanon1 || '—';
                const c2 = f.chokeCanon2 || '—';
                fixesText.textContent = c1.split(' (')[0] + ' / ' + c2.split(' (')[0];
                fixesDiv.style.display = 'block';
                amovDiv.style.display = 'none';
            } else {
                fixesDiv.style.display = 'none';
                amovDiv.style.display = 'block';
                // Pré-remplir avec les derniers chokes utilisés par cet élève pour ce fusil
                const lastChokes = getDerniersChokesEleve(f.id);
                document.getElementById('coaching-choke1').value = lastChokes.c1 || '';
                document.getElementById('coaching-choke2').value = lastChokes.c2 || '';
            }
        } else {
            textEl.textContent = '-- Aucun fusil --';
            fixesDiv.style.display = 'none';
            amovDiv.style.display = 'none';
            if (btnDel) { btnDel.style.display = 'none'; }
        }
    }

    // Retrouver les derniers chokes utilisés par l'élève actif pour un fusil donné
    function getDerniersChokesEleve(fusilId) {
        if (!_eleveActif || !_eleveActif.nom) return {};
        const series = db.eleves[_eleveActif.nom] || [];
        // Chercher la série la plus récente avec ce fusil
        for (let i = 0; i < series.length; i++) {
            const s = series[i];
            if (s.fusilId === fusilId && s.chokesAmovibles) {
                return s.chokesAmovibles; // { c1, c2 }
            }
        }
        return {};
    }

    // Fermer le dropdown coaching si on clique ailleurs
    document.addEventListener('click', function(e) {
        const sel = document.getElementById('coaching-fusil-select');
        if (sel && !sel.contains(e.target)) {
            const opts = document.getElementById('coaching-fusil-options');
            if (opts) opts.style.display = 'none';
        }
    });

    // ---- Ajouter un fusil au pool global ----
    function ouvrirModalFusil() {
        document.getElementById('input-nom-fusil').value = '';
        document.getElementById('input-type-fusil').value = '';
        document.getElementById('chokes-fixes-fields').style.display = 'block';
        document.querySelectorAll('#choke-type-group .btn-choice').forEach((b, i) => b.classList.toggle('active', i === 0));
        document.getElementById('input-choke-canon1').value = '';
        document.getElementById('input-choke-canon2').value = '';
        document.getElementById('modal-fusil').style.display = 'flex';
    }

    function fermerModalFusil() {
        document.getElementById('modal-fusil').style.display = 'none';
    }

    function selectChokeType(btn) {
        document.querySelectorAll('#choke-type-group .btn-choice').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('chokes-fixes-fields').style.display = btn.dataset.val === 'fixes' ? 'block' : 'none';
    }

    function validerAjoutFusil() {
        const nom = document.getElementById('input-nom-fusil').value.trim();
        if (!nom) { showToast('Le nom du fusil est obligatoire.', 'error'); return; }
        const type = document.getElementById('input-type-fusil').value.trim();
        const chokeType = document.querySelector('#choke-type-group .btn-choice.active')?.dataset.val || 'fixes';

        const fusil = {
            id: 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            nom: nom,
            type: type,
            chokeType: chokeType,
            chokeCanon1: chokeType === 'fixes' ? document.getElementById('input-choke-canon1').value : '',
            chokeCanon2: chokeType === 'fixes' ? document.getElementById('input-choke-canon2').value : ''
        };

        if (!db.arsenal) db.arsenal = [];
        db.arsenal.push(fusil);
        _coachingFusilId = fusil.id;

        // Mémoriser ce fusil pour l'élève actif
        if (_eleveActif && _eleveActif.nom) {
            if (!db.eleveInfo[_eleveActif.nom]) db.eleveInfo[_eleveActif.nom] = {};
            db.eleveInfo[_eleveActif.nom].fusilId = fusil.id;
        }

        saveDB();
        fermerModalFusil();
        renderCoachingFusilDropdown();
        updateCoachingChokeDisplay();
        showToast('Fusil ajouté !', 'success');
    }

    // ---- Supprimer un fusil du pool global ----
    function supprimerFusil() {
        if (!_coachingFusilId) return;
        const f = (db.arsenal || []).find(g => g.id === _coachingFusilId);
        if (!f) return;
        showConfirm('Supprimer le fusil « ' + f.nom + ' » ?', (ok) => {
            if (!ok) return;
            db.arsenal = db.arsenal.filter(g => g.id !== _coachingFusilId);
            // Nettoyer les références dans eleveInfo
            Object.keys(db.eleveInfo || {}).forEach(nom => {
                if (db.eleveInfo[nom].fusilId === _coachingFusilId) {
                    delete db.eleveInfo[nom].fusilId;
                }
            });
            _coachingFusilId = db.arsenal.length > 0 ? db.arsenal[0].id : '';
            saveDB();
            renderCoachingFusilDropdown();
            updateCoachingChokeDisplay();
            showToast('Fusil supprimé.', 'info');
        }, 'SUPPRIMER', 'var(--r-color)');
    }

    // Récupérer les infos fusil pour la sauvegarde de série
    function getCoachingFusilNom() {
        const f = (db.arsenal || []).find(g => g.id === _coachingFusilId);
        return f ? f.nom : '';
    }

    function getCoachingChokes() {
        const f = (db.arsenal || []).find(g => g.id === _coachingFusilId);
        if (!f) return '';
        if (f.chokeType === 'fixes') {
            const c1 = f.chokeCanon1 || '';
            const c2 = f.chokeCanon2 || '';
            return c1.split(' (')[0] + ' / ' + c2.split(' (')[0];
        } else if (f.chokeType === 'amovibles') {
            const c1 = document.getElementById('coaching-choke1')?.value || '';
            const c2 = document.getElementById('coaching-choke2')?.value || '';
            if (c1 && c2) return c1.split(' (')[0] + ' / ' + c2.split(' (')[0];
            return '';
        }
        return '';
    }

    function choisirModeCoaching(mode) {
        _coachingMode = mode;
        document.querySelectorAll('#coaching-mode-bar .coaching-mode-btn').forEach(b => {
            b.classList.toggle('active', parseInt(b.dataset.mode) === mode);
        });
    }

    // ---- PCH/CS : Choix de la ligne de tir ----
    function choisirLignePCH(ligne, el) {
        _lignePCH = ligne;
        document.querySelectorAll('#coaching-ligne-pch .coaching-mode-btn').forEach(b => {
            b.classList.toggle('active', parseInt(b.dataset.ligne) === ligne);
        });
        // Afficher/masquer le sélecteur "poste à 3 machines" si ligne 4
        const divPosteSpecial = document.getElementById('coaching-poste-special');
        if (divPosteSpecial) divPosteSpecial.style.display = (ligne === 4) ? 'block' : 'none';
        // Adapter le nombre de boutons poste
        updateCoachingPostes(ligne);
    }

    function choisirPosteSpecialPCH(ps, el) {
        _posteSpecialPCH = ps;
        document.querySelectorAll('#coaching-poste-special .coaching-mode-btn').forEach(b => {
            b.classList.toggle('active', parseInt(b.dataset.ps) === ps);
        });
    }

    // ---- CS : Sélecteur de catégorie et grille ----
    function onCSGrilleInput(el) {
        const v = parseInt(el.value, 10);
        const info = document.getElementById('cs-grille-info');
        if (!v || v < 1 || v > 40) {
            _csGrilleNum = 0;
            if (info) { info.textContent = ''; info.style.color = 'var(--text-muted)'; }
            el.classList.remove('has-value');
        } else {
            _csGrilleNum = v;
            if (info) { info.textContent = 'Grille ' + v + ' — ' + csCategorieGrille(v); info.style.color = 'var(--v-color)'; }
            el.classList.add('has-value');
        }
    }

    function updateCoachingPostes(ligne) {
        const container = document.getElementById('coaching-postes');
        if (!container) return;
        const nbPostes = ligne || 5;
        container.innerHTML = '';
        for (let p = 1; p <= nbPostes; p++) {
            const btn = document.createElement('button');
            btn.className = 'btn-poste' + (p === 1 ? ' active' : '');
            btn.dataset.poste = p;
            btn.textContent = p;
            btn.onclick = function() { choisirPosteCoaching(p, this); };
            container.appendChild(btn);
        }
        _coachingPoste = 1;
    }

    // ---- Afficher/masquer les sélecteurs PCH selon la discipline ----
    function updateCoachingPCHSelectors(disc) {
        const divLigne = document.getElementById('coaching-ligne-pch');
        const divPosteSpecial = document.getElementById('coaching-poste-special');
        const divGrilleCS = document.getElementById('coaching-grille-cs');
        if (disc === 'CS') {
            // CS : toujours 5 postes, champ n° de grille
            if (divLigne) divLigne.style.display = 'none';
            if (divPosteSpecial) divPosteSpecial.style.display = 'none';
            if (divGrilleCS) divGrilleCS.style.display = 'block';
            updateCoachingPostes(5);
            // Restaurer la valeur du champ si déjà défini
            const inp = document.getElementById('cs-grille-input');
            if (inp && _csGrilleNum > 0) { inp.value = _csGrilleNum; onCSGrilleInput(inp); }
        } else if (disc === 'PCH') {
            // PCH : sélecteur de ligne (3/4/5 postes)
            if (divLigne) divLigne.style.display = 'block';
            if (divPosteSpecial) divPosteSpecial.style.display = (_lignePCH === 4) ? 'block' : 'none';
            if (divGrilleCS) divGrilleCS.style.display = 'none';
            updateCoachingPostes(_lignePCH);
        } else {
            if (divLigne) divLigne.style.display = 'none';
            if (divPosteSpecial) divPosteSpecial.style.display = 'none';
            if (divGrilleCS) divGrilleCS.style.display = 'none';
            updateCoachingPostes(5);
        }
    }

    function choisirPosteCoaching(poste, el) {
        _coachingPoste = poste;
        document.querySelectorAll('#coaching-postes .btn-poste').forEach(b => b.classList.remove('active'));
        if (el) el.classList.add('active');
    }

    function updateCoachingCompTracker() {
        const tracker = document.getElementById('coaching-comp-tracker');
        const modeBar = document.getElementById('coaching-mode-bar');
        const btnLancer = document.getElementById('btn-lancer-coaching');
        if (!tracker) return;
        
        if (_eleveActif && db.activeComps && db.activeComps[_eleveActif.nom]) {
            const comp = db.activeComps[_eleveActif.nom];
            const totalRequis = comp.mode === 100 ? 4 : 8;
            const nbFaites = comp.series ? comp.series.length : 0;
            tracker.style.display = 'block';
            // Masquer le sélecteur de mode pendant la compétition
            if (modeBar) modeBar.style.display = 'none';
            document.getElementById('coaching-comp-texte').textContent = comp.disc + ' - ' + comp.mode + ' plateaux';
            document.getElementById('coaching-comp-progression').textContent = 'Série ' + nbFaites + ' / ' + totalRequis + ' terminées';
            // Forcer le mode compétition
            _coachingMode = comp.mode;
            currentModeComp = comp.mode;
            document.querySelectorAll('#coaching-mode-bar .coaching-mode-btn').forEach(b => {
                b.classList.toggle('active', parseInt(b.dataset.mode) === comp.mode);
            });
            // Changer le texte du bouton LANCER pendant la compétition
            if (btnLancer) {
                const prochaineSerie = nbFaites + 1;
                btnLancer.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:white;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle;margin-right:4px;"><path d="M12 2c.5 2.5-.5 5-2 7-1.5-1-2-3-2-5-2 2-3.5 5-3 8 .5 3 3 5.5 5 6 2-.5 4.5-3 5-6 .5-3-1-6-3-8z"></path></svg> SÉRIE ' + prochaineSerie + ' / ' + totalRequis;
            }
        } else {
            tracker.style.display = 'none';
            // Réafficher le sélecteur de mode
            if (modeBar) modeBar.style.display = 'flex';
            // Reset à entraînement si plus de comp
            _coachingMode = 0;
            currentModeComp = 0;
            document.querySelectorAll('#coaching-mode-bar .coaching-mode-btn').forEach(b => {
                b.classList.toggle('active', parseInt(b.dataset.mode) === 0);
            });
            // Remettre le texte par défaut du bouton LANCER
            if (btnLancer) {
                btnLancer.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:white;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle;margin-right:4px;"><path d="M12 2c.5 2.5-.5 5-2 7-1.5-1-2-3-2-5-2 2-3.5 5-3 8 .5 3 3 5.5 5 6 2-.5 4.5-3 5-6 .5-3-1-6-3-8z"></path></svg> LANCER LA SÉANCE';
            }
        }
    }

    function annulerCompetitionCoaching() {
        if (!_eleveActif) return;
        showConfirm("Annuler la compétition en cours ? Les séries déjà tirées resteront dans l'historique.", (ok) => {
            if (ok) {
                if (db.activeComps && db.activeComps[_eleveActif.nom]) {
                    delete db.activeComps[_eleveActif.nom];
                    saveDB();
                }
                showToast("Compétition annulée.", "info");
                updateCoachingCompTracker();
            }
        });
    }

    function lancerSeanceCoaching() {
        if (!_eleveActif || !_eleveActif.nom || !_eleveActif.disc) {
            showToast('Sélectionnez un élève avec une discipline.', 'error');
            return;
        }
        if (_eleveActif.disc === 'CS' && (!_csGrilleNum || _csGrilleNum < 1 || _csGrilleNum > 40)) {
            showToast('Entrez un numéro de grille CS (1-40) avant de lancer.', 'error');
            return;
        }
        // Configurer le contexte de tir
        currentTireur = _eleveActif.nom;
        currentDisc = _eleveActif.disc;
        currentPoste = _coachingPoste;
        currentVent = 'faible'; // Sera ajusté sur la page de tir

        // Si une compétition est en cours pour cet élève, on force le mode compétition
        if (db.activeComps && db.activeComps[currentTireur]) {
            currentModeComp = db.activeComps[currentTireur].mode;
        } else {
            currentModeComp = _coachingMode;
        }

        // Lancer directement le coaching (sans modale discipline/poste)
        lancerCoachingDirect();
    }

    function lancerCoachingDirect() {
        try {
            if (!currentTireur || !currentDisc) {
                showToast('Erreur : aucun tireur ou discipline sélectionné.', 'error');
                return;
            }
            let disc = currentDisc;
            serieEnCours = [];
            directionsEnCours = [];
            _noBirdCount = 0;
            if(typeof annulerDirection === 'function') annulerDirection();

            // ---- PCH/CS : Générer le menu séquentiel ----
            if (disc === 'CS') {
                if (!_csGrilleNum || _csGrilleNum < 1 || _csGrilleNum > 40) {
                    showToast('Entrez un numéro de grille CS (1-40) avant de lancer.', 'error');
                    return;
                }
                _menuPCH = genererMenuCS(_csGrilleNum, currentPoste);
                _indexMenu = 0;
            } else if (disc === 'PCH') {
                _menuPCH = genererMenuPCH(disc, _lignePCH, _posteSpecialPCH, currentPoste);
                _indexMenu = 0;
            } else {
                _menuPCH = [];
                _indexMenu = 0;
            }

            // Gestion compétition
            if (!db.activeComps) db.activeComps = {};
            if (currentModeComp > 0 && !db.activeComps[currentTireur]) {
                db.activeComps[currentTireur] = {
                    id: Date.now(),
                    mode: currentModeComp,
                    disc: disc,
                    series: []
                };
                saveDB();
                showToast('Dossier compétition créé (' + currentModeComp + ' plateaux) !', 'success');
            }
            // Si comp en cours, forcer la discipline
            if (db.activeComps[currentTireur]) {
                currentDisc = db.activeComps[currentTireur].disc;
                disc = currentDisc;
            }

            // Sécurité : s'assurer que l'élève existe dans la DB
            if (!db.eleves[currentTireur]) {
                db.eleves[currentTireur] = [];
                saveDB();
            }

            // Charger météo si pas encore fait
            chargerMeteoDynamique();

            const posteLabel = currentPoste ? ' · P' + currentPoste : '';
            const grilleLabel = (disc === 'CS' && _csGrilleNum) ? ' · G' + _csGrilleNum : '';
            const badge = document.getElementById('badge-tir');
            if (badge) badge.textContent = currentTireur + " | " + disc + posteLabel + grilleLabel;
            const g = document.getElementById('grid-25');
            if (g) {
                g.innerHTML = "";
                const estPCHCS = DISC_DOUBLES.includes(disc);
                // Pour CS : construire le mapping plateau→label (machine letter)
                var csPlateauLabels = [];
                if (disc === 'CS' && _menuPCH.length > 0) {
                    _menuPCH.forEach(item => {
                        if (item.type === 'simple') {
                            csPlateauLabels.push(item.machine);
                        } else if (item.type === 'double') {
                            csPlateauLabels.push(item.machines[0]);
                            csPlateauLabels.push(item.machines[1]);
                        }
                    });
                }
                for (let i = 1; i <= 25; i++) {
                    const t = document.createElement('div');
                    t.style.cssText = 'width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:900;color:var(--text-muted);background:var(--bg);box-shadow:2px 2px 5px var(--shadow-dark),-2px -2px 5px var(--shadow-light);flex-shrink:0;';
                    if (disc === 'CS' && csPlateauLabels[i-1]) {
                        t.textContent = csPlateauLabels[i-1]; // Machine letter
                    } else if (estPCHCS && _menuPCH.length > 0) {
                        t.textContent = calculerPoste(i, disc, currentPoste);
                    } else {
                        t.textContent = calculerPoste(i, disc, currentPoste);
                    }
                    g.appendChild(t);
                }
            }

            // Reset note coach
            const noteEl = document.getElementById('note-coach');
            if (noteEl) noteEl.value = '';

            sauvegarderSerieTemp();
            requestWakeLock();
            updateTirUI();
            switchTab('page-tir', null);
        } catch(err) {
            console.error('lancerCoachingDirect error:', err);
            showToast('Erreur lors du lancement : ' + err.message, 'error');
        }
    }

    /* =========================================================
       PAGE HISTORIQUE — Arborescence Style Tracker
    ========================================================= */
    var _histoSvgChevronRight = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    var _histoSvgChevronDown = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    var _histoSvgCalendar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';
    var _HISTO_MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

    function renderHistorique() {
        const container = document.getElementById('historique-eleve-container');
        const listContainer = document.getElementById('historique-list');
        if (!container || !listContainer) return;

        listContainer.innerHTML = '';

        if (!_eleveActif || !_eleveActif.nom) {
            container.innerHTML = `
                <div class="histo-vide-card">
                    <div class="coaching-vide-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></div>
                    <div style="color:var(--text-muted);font-size:0.9rem;margin-bottom:14px;">Sélectionnez un élève pour voir son historique.</div>
                    <button class="btn-main" onclick="switchTab('page-eleves', null)">Choisir un élève</button>
                </div>
            `;
            return;
        }

        const DISC_LABELS = { 'FU': 'Fosse Universelle', 'DTL': 'Fosse DTL', 'TRAP 1': 'Trap 1', 'PCH': 'Parcours de Chasse', 'CS': 'Compak Sporting' };
        // Séries de l'élève FILTRÉES par la discipline sélectionnée
        const allSeries = (db.eleves[_eleveActif.nom] || []);
        const discActive = _eleveActif.disc || _selectedDisc;
        const series = discActive ? allSeries.filter(s => s.disc === discActive) : allSeries;
        const discLabel = DISC_LABELS[discActive] || discActive || 'Aucune discipline';

        container.innerHTML = `
            <div class="coaching-eleve-card">
                <div class="coaching-eleve-nom">${sanitize(_eleveActif.nom)}</div>
                <div class="coaching-eleve-disc">${discLabel}</div>
                <div class="coaching-eleve-info">${series.length} série${series.length !== 1 ? 's' : ''} enregistrée${series.length !== 1 ? 's' : ''} en ${discActive || '?'}</div>
            </div>
        `;

        if (series.length === 0) {
            listContainer.innerHTML = '<div class="disc-folder-empty">Aucune série enregistrée en ' + (discActive || '?') + '</div>';
            return;
        }

        // Construire l'arborescence : Année → Trimestre → Mois → Semaine → Séries
        const tree = _buildHistoTree(series);
        _renderHistoTree(listContainer, tree, 0);
    }

    function _parseHistoDate(dateStr) {
        if (!dateStr) return null;
        const parts = dateStr.split('/');
        if (parts.length !== 3) return null;
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }

    /* =========================================================
       RENDU DYNAMIQUE — Stats & Analyse (calqué sur Historique)
    ========================================================= */
    function renderStats() {
        var container = document.getElementById('stats-eleve-container');
        if (!container) return;

        if (!_eleveActif || !_eleveActif.nom) {
            container.innerHTML = '<div class="histo-vide-card"><div class="coaching-vide-icon"><svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg></div><div style="color:var(--text-muted);font-size:0.9rem;margin-bottom:14px;">Sélectionnez un élève pour voir ses stats.</div><button class="btn-main" onclick="switchTab(\'page-eleves\', null)">Choisir un élève</button></div>';
            return;
        }

        // Élève actif existe → afficher ses stats
        afficherStatsEleve(_eleveActif.nom);
    }

    function renderAnalyse() {
        var container = document.getElementById('analyse-eleve-container');
        if (!container) return;

        if (!_eleveActif || !_eleveActif.nom) {
            container.innerHTML = '<div class="histo-vide-card"><div class="coaching-vide-icon"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></div><div style="color:var(--text-muted);font-size:0.9rem;margin-bottom:14px;">Sélectionnez un élève pour voir son analyse.</div><button class="btn-main" onclick="switchTab(\'page-eleves\', null)">Choisir un élève</button></div>';
            return;
        }

        // Élève actif existe → afficher son analyse
        afficherAnalyseEleve(_eleveActif.nom);
    }

    function _getMonday(d) {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        date.setDate(diff);
        date.setHours(0,0,0,0);
        return date;
    }

    function _fmtDDMM(d) {
        return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
    }

    function _quarterLabel(q, year) {
        const labels = { 1: 'T1 — Janvier à Mars', 2: 'T2 — Avril à Juin', 3: 'T3 — Juillet à Septembre', 4: 'T4 — Octobre à Décembre' };
        return labels[q] || 'T' + q;
    }

    function _buildHistoTree(series) {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentQ = Math.floor(now.getMonth() / 3) + 1;
        const currentMonth = now.getMonth();

        const yearMap = {};
        series.forEach(s => {
            const d = _parseHistoDate(s.date);
            if (!d) return;
            const y = d.getFullYear();
            const m = d.getMonth();
            const q = Math.floor(m / 3) + 1;
            const monday = _getMonday(d);
            const weekKey = monday.toISOString().slice(0, 10);
            const sunday = new Date(monday);
            sunday.setDate(sunday.getDate() + 6);
            const weekLabel = 'Semaine du ' + _fmtDDMM(monday) + ' au ' + _fmtDDMM(sunday);

            if (!yearMap[y]) yearMap[y] = {};
            if (!yearMap[y][q]) yearMap[y][q] = {};
            if (!yearMap[y][q][m]) yearMap[y][q][m] = {};
            if (!yearMap[y][q][m][weekKey]) yearMap[y][q][m][weekKey] = { label: weekLabel, series: [] };
            yearMap[y][q][m][weekKey].series.push(s);
        });

        const tree = [];
        Object.keys(yearMap).sort((a, b) => b - a).forEach(y => {
            const yearNode = { type: 'year', label: y, isCurrent: parseInt(y) === currentYear, children: [] };
            Object.keys(yearMap[y]).sort((a, b) => b - a).forEach(q => {
                const qNum = parseInt(q);
                const quarterNode = { type: 'quarter', label: _quarterLabel(qNum, parseInt(y)), isCurrent: parseInt(y) === currentYear && qNum === currentQ, children: [] };
                Object.keys(yearMap[y][q]).sort((a, b) => b - a).forEach(m => {
                    const mNum = parseInt(m);
                    const monthNode = { type: 'month', label: _HISTO_MONTHS[mNum], isCurrent: parseInt(y) === currentYear && mNum === currentMonth, children: [] };
                    Object.keys(yearMap[y][q][m]).sort((a, b) => b - a).forEach(wk => {
                        const weekData = yearMap[y][q][m][wk];
                        const weekMonday = new Date(wk + 'T00:00:00');
                        const nowMonday = _getMonday(now);
                        const weekNode = { type: 'week', label: weekData.label, isCurrent: weekMonday.getTime() === nowMonday.getTime(), series: weekData.series };
                        monthNode.children.push(weekNode);
                    });
                    quarterNode.children.push(monthNode);
                });
                yearNode.children.push(quarterNode);
            });
            tree.push(yearNode);
        });
        return tree;
    }

    function _countAllHistoSeries(node) {
        if (node.series) return node.series.length;
        if (!node.children) return 0;
        return node.children.reduce((sum, c) => sum + _countAllHistoSeries(c), 0);
    }

    function _renderHistoTree(container, nodes, depth) {
        nodes.forEach(node => {
            const folder = document.createElement('div');
            folder.className = 'tree-folder';
            folder.dataset.depth = depth;

            const header = document.createElement('div');
            header.className = 'tree-folder-header';

            const icon = document.createElement('span');
            icon.className = 'tree-folder-icon';
            icon.innerHTML = _histoSvgChevronRight;

            const typeIcon = document.createElement('span');
            typeIcon.className = 'tree-folder-type-icon';
            typeIcon.innerHTML = _histoSvgCalendar;

            const label = document.createElement('span');
            label.className = 'tree-folder-label';
            label.textContent = node.label;

            const count = document.createElement('span');
            count.className = 'tree-folder-count';
            const total = _countAllHistoSeries(node);
            count.textContent = total + ' série' + (total > 1 ? 's' : '');

            header.append(icon, typeIcon, label, count);
            folder.appendChild(header);

            const content = document.createElement('div');
            content.className = 'tree-folder-content';
            content.style.display = 'none';

            if (node.type === 'week' && node.series) {
                // Niveau le plus bas : afficher les cartes de séries
                node.series.sort((a, b) => (b.id || 0) - (a.id || 0)).forEach(s => {
                    const max = maxParSerie(s.disc);
                    const pct = Math.round((parseInt(s.score) / max) * 100);
                    const card = document.createElement('div');
                    card.className = 'tree-serie-card';
                    const discClass = s.disc ? 'disc-' + s.disc.toLowerCase().replace(/\s+/g, '') : '';
                    card.innerHTML = `
                        <div class="tree-serie-left">
                            <div class="tree-serie-date">${s.date}${s.poste ? ' · Poste ' + s.poste : ''}</div>
                            <div class="tree-serie-details">${s.vent && s.vent !== 'faible' ? '💨 ' + s.vent : ''}${s.note ? ' 📝' : ''}</div>
                        </div>
                        <div class="tree-serie-score">${s.score}/${max}</div>
                        <div class="tree-serie-pct">${pct}%</div>
                        <span class="tree-serie-disc ${discClass}">${s.disc || '?'}</span>
                        <button class="tree-serie-delete" title="Supprimer cette série" onclick="event.stopPropagation();">
                            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    `;
                    card.onclick = function() {
                        ouvrirStatsPourSerie(s);
                    };
                    // Gestion poubelle
                    var deleteBtn = card.querySelector('.tree-serie-delete');
                    if (deleteBtn) {
                        deleteBtn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            if (confirm('Supprimer cette série du ' + s.date + ' ?')) {
                                supprimerSerieHistorique(s.id, card);
                            }
                        });
                    }
                    content.appendChild(card);
                });
            } else if (node.children) {
                _renderHistoTree(content, node.children, depth + 1);
            }

            if (content.children.length === 0) return;

            folder.appendChild(content);
            container.appendChild(folder);

            header.addEventListener('click', function() {
                const isOpen = content.style.display !== 'none';
                if (isOpen) {
                    content.style.display = 'none';
                    content.classList.remove('animating');
                } else {
                    content.style.display = 'block';
                    content.classList.remove('animating');
                    // Forcer le reflow pour relancer l'animation
                    void content.offsetWidth;
                    content.classList.add('animating');
                }
                icon.innerHTML = isOpen ? _histoSvgChevronRight : _histoSvgChevronDown;
                header.classList.toggle('open', !isOpen);
            });

            // Auto-ouvrir si c'est la période en cours
            if (node.isCurrent) {
                content.style.display = 'block';
                icon.innerHTML = _histoSvgChevronDown;
                header.classList.add('open');
            }
        });
    }

    /* =========================================================
       STATS SÉRIE CIBLÉE (clic historique)
    ========================================================= */

    function ouvrirStatsPourSerie(serieObj) {
        currentTireur = _eleveActif.nom;
        // Forcer la discipline de cette série
        if (serieObj.disc) {
            currentDisc = serieObj.disc;
            if (_eleveActif) _eleveActif.disc = serieObj.disc;
        }
        // Stocker la série ciblée (restera active tant que l'utilisateur ne clique pas "Retour")
        window._statsSerieCiblee = serieObj;
        // Ouvrir Stats (switchTab déclenche renderStats → afficherStatsEleve, pas besoin de rappeler)
        switchTab('page-stats', null);
    }

    function statsRetourNormal() {
        window._statsSerieCiblee = null;
        // Réinitialiser l'affichage en mode normal
        _statsMode = 'derniere';
        afficherStatsEleve(currentTireur);
    }

    function supprimerSerieHistorique(serieId, cardEl) {
        if (!_eleveActif || !_eleveActif.nom) return;
        var series = db.eleves[_eleveActif.nom];
        if (!series) return;
        var idx = series.findIndex(function(s) { return s.id === serieId; });
        if (idx === -1) return;
        // Supprimer la série
        series.splice(idx, 1);
        saveDB();
        // Animation de suppression
        if (cardEl) {
            cardEl.style.transition = 'all 0.3s ease';
            cardEl.style.opacity = '0';
            cardEl.style.transform = 'translateX(30px)';
            cardEl.style.maxHeight = cardEl.offsetHeight + 'px';
            setTimeout(function() {
                cardEl.style.maxHeight = '0';
                cardEl.style.padding = '0 14px';
                cardEl.style.marginBottom = '0';
            }, 200);
            setTimeout(function() {
                renderHistorique();
            }, 500);
        } else {
            renderHistorique();
        }
    }

    function ajouterEleve() {
        const input = document.getElementById('input-nom-eleve');
        input.value = '';
        document.getElementById('ajout-tel').value = '';
        document.getElementById('ajout-email').value = '';
        document.getElementById('ajout-licence').value = '';
        document.getElementById('ajout-club').value = '';
        // Reset sélecteurs
        document.querySelectorAll('#ajout-profil [data-eprof]').forEach(b => b.classList.toggle('active', b.dataset.eprof === 'Confirmé'));
        document.querySelectorAll('#ajout-calibre [data-ecal]').forEach(b => b.classList.toggle('active', b.dataset.ecal === '12'));
        document.querySelectorAll('#ajout-lateralite [data-elat]').forEach(b => b.classList.toggle('active', b.dataset.elat === 'droitier'));
        // Reset disciplines : si _eleveDiscFilter est actif, pré-cocher cette discipline
        document.querySelectorAll('#ajout-disciplines .disc-toggle').forEach(b => {
            b.classList.toggle('active', b.dataset.disc === _eleveDiscFilter);
        });
        document.getElementById('modal-ajout-eleve').style.display = 'flex';
        input.focus();
        input.onkeydown = (e) => { if (e.key === 'Enter') validerAjoutEleve(); };
    }
    function fermerAjoutEleve() {
        document.getElementById('modal-ajout-eleve').style.display = 'none';
    }
    function validerAjoutEleve() {
        const input = document.getElementById('input-nom-eleve');
        const nomPropre = input.value.trim();
        if (!nomPropre) { showToast('Entrez un nom.', 'error'); return; }
        if (nomPropre.length > 50) { showToast('Nom trop long (50 car. max).', 'error'); return; }

        const disciplines = [...document.querySelectorAll('#ajout-disciplines .disc-toggle.active')].map(b => b.dataset.disc);

        // Vérifier si l'élève existe déjà (insensible à la casse)
        const nomExistant = trouverEleveParNom(nomPropre);
        if (nomExistant) {
            // Élève existant → ajouter les nouvelles disciplines à son dossier (sous le nom existant)
            const nouvellesDiscs = disciplines.filter(d => !getDiscsEleve(nomExistant).includes(d));
            if (nouvellesDiscs.length === 0) {
                showToast(nomExistant + ' est déjà inscrit' + (nomExistant.endsWith('e') || nomExistant.endsWith('es') ? 'e' : '') + ' dans ces disciplines.', 'info');
                fermerAjoutEleve();
                return;
            }
            // Ajouter les nouvelles disciplines
            if (!db.eleveInfo) db.eleveInfo = {};
            if (!db.eleveInfo[nomExistant]) db.eleveInfo[nomExistant] = { calibre: '12', lateralite: 'droitier', tel: '', email: '', licence: '', club: '', disciplines: [] };
            if (!db.eleveInfo[nomExistant].disciplines) db.eleveInfo[nomExistant].disciplines = [];
            nouvellesDiscs.forEach(d => {
                if (!db.eleveInfo[nomExistant].disciplines.includes(d)) {
                    db.eleveInfo[nomExistant].disciplines.push(d);
                }
            });
            saveDB();
            fermerAjoutEleve();
            renderEleves();
            showToast(nomExistant + ' : ' + nouvellesDiscs.join(', ') + ' ajouté' + (nouvellesDiscs.length > 1 ? 'es' : (nouvellesDiscs[0] === 'FU' ? 'e' : '')) + ' au dossier !', 'success');
            return;
        }

        // Nouvel élève
        const profil = document.querySelector('#ajout-profil [data-eprof].active')?.dataset.eprof || 'Confirmé';
        const calibre = document.querySelector('#ajout-calibre [data-ecal].active')?.dataset.ecal || '12';
        const lateralite = document.querySelector('#ajout-lateralite [data-elat].active')?.dataset.elat || 'droitier';
        const tel = document.getElementById('ajout-tel').value.trim();
        const email = document.getElementById('ajout-email').value.trim();
        const licence = document.getElementById('ajout-licence').value.trim();
        const club = document.getElementById('ajout-club').value.trim();

        db.eleves[nomPropre] = [];
        db.profils[nomPropre] = profil;
        if (!db.eleveInfo) db.eleveInfo = {};
        db.eleveInfo[nomPropre] = { calibre, lateralite, tel, email, licence, club, disciplines };

        saveDB();
        fermerAjoutEleve();
        renderEleves();
        showToast('Élève ajouté !', 'success');
    }

    // --- ÉDITION ÉLÈVE ---
    function selectEditProfil(btn) {
        document.querySelectorAll('#edit-profil [data-eprof]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    function ouvrirEditerEleve() {
        if (!currentTireur) return;
        if (!db.eleveInfo) db.eleveInfo = {};
        const info = db.eleveInfo[currentTireur] || { calibre: '12', lateralite: 'droitier', tel: '', email: '', licence: '', club: '', disciplines: [], fusilId: '' };
        const profil = db.profils[currentTireur] || 'Confirmé';
        
        document.getElementById('edit-nom-eleve').value = currentTireur;
        document.querySelectorAll('#edit-profil [data-eprof]').forEach(b => b.classList.toggle('active', b.dataset.eprof === profil));
        document.getElementById('edit-tel').value = info.tel || '';
        document.getElementById('edit-email').value = info.email || '';
        document.getElementById('edit-licence').value = info.licence || '';
        document.getElementById('edit-club').value = info.club || '';
        document.querySelectorAll('#edit-lateralite [data-elat]').forEach(b => b.classList.toggle('active', b.dataset.elat === (info.lateralite || 'droitier')));
        // Pré-cocher les disciplines de l'élève (pré-assignées + séries existantes)
        const discs = getDiscsEleve(currentTireur);
        document.querySelectorAll('#edit-disciplines .disc-toggle').forEach(b => {
            b.classList.toggle('active', discs.includes(b.dataset.disc));
        });
        
        document.getElementById('modal-editer-eleve').style.display = 'flex';
    }
    function fermerEditerEleve() {
        document.getElementById('modal-editer-eleve').style.display = 'none';
    }
    function selectEditLateralite(btn) {
        document.querySelectorAll('#edit-lateralite [data-elat]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    function validerEditerEleve() {
        if (!currentTireur) return;
        const nouveauNom = document.getElementById('edit-nom-eleve').value.trim();
        const nouveauProfil = document.querySelector('#edit-profil [data-eprof].active')?.dataset.eprof || 'Confirmé';
        const calibre = (db.eleveInfo && db.eleveInfo[currentTireur])?.calibre || '12';
        const lateralite = document.querySelector('#edit-lateralite [data-elat].active')?.dataset.elat || 'droitier';
        const tel = document.getElementById('edit-tel').value.trim();
        const email = document.getElementById('edit-email').value.trim();
        const licence = document.getElementById('edit-licence').value.trim();
        const club = document.getElementById('edit-club').value.trim();
        const disciplines = [...document.querySelectorAll('#edit-disciplines .disc-toggle.active')].map(b => b.dataset.disc);
        
        if (!nouveauNom) { showToast('Le nom ne peut pas être vide.', 'error'); return; }
        
        // Si le nom a changé, on renomme l'élève
        if (nouveauNom !== currentTireur) {
            if (db.eleves[nouveauNom]) { showToast('Ce nom existe déjà.', 'error'); return; }
            if (nouveauNom.length > 50) { showToast('Nom trop long (50 car. max).', 'error'); return; }
            
            // Migrer toutes les données sous la nouvelle clé
            db.eleves[nouveauNom] = db.eleves[currentTireur];
            delete db.eleves[currentTireur];
            db.profils[nouveauNom] = nouveauProfil;
            delete db.profils[currentTireur];
            if (db.eleveInfo) {
                // Préserver le fusilId existant de l'élève
                const ancienFusilId = (db.eleveInfo[currentTireur] || {}).fusilId;
                db.eleveInfo[nouveauNom] = { calibre, lateralite, tel, email, licence, club, disciplines, fusilId: ancienFusilId || '' };
                delete db.eleveInfo[currentTireur];
            }
            if (db.activeComps && db.activeComps[currentTireur]) {
                db.activeComps[nouveauNom] = db.activeComps[currentTireur];
                delete db.activeComps[currentTireur];
            }
            if (db.archivesComps && db.archivesComps[currentTireur]) {
                db.archivesComps[nouveauNom] = db.archivesComps[currentTireur];
                delete db.archivesComps[currentTireur];
            }
            // Mettre à jour le tireur courant dans les séries
            if (db.eleves[nouveauNom]) {
                db.eleves[nouveauNom].forEach(s => s.tireur = nouveauNom);
            }
            currentTireur = nouveauNom;
        } else {
            db.profils[currentTireur] = nouveauProfil;
        }
        
        if (!db.eleveInfo) db.eleveInfo = {};
        const existingFusilId = (db.eleveInfo[currentTireur] || {}).fusilId;
        db.eleveInfo[currentTireur] = { calibre, lateralite, tel, email, licence, club, disciplines, fusilId: existingFusilId || '' };
        
        saveDB();
        fermerEditerEleve();
        document.getElementById('nom-fiche-eleve').textContent = sanitize(currentTireur);
        refreshFicheEleve();
        renderEleves();
        showToast('Élève modifié !', 'success');
    }

    function retirerEleveDeDisc(nom, disc, event) {
        event.stopPropagation();
        const series = db.eleves[nom] || [];
        const seriesDansDisc = series.filter(s => s.disc === disc);
        const seriesAutresDisc = series.filter(s => s.disc !== disc);
        const autresDiscs = getDiscsEleve(nom).filter(d => d !== disc);

        // Cas 1 : l'élève n'existe que dans cette discipline (ou n'a rien du tout)
        if (autresDiscs.length === 0 && seriesAutresDisc.length === 0) {
            showConfirm('Supprimer définitivement ' + nom + ' ?', (ok) => {
                if (!ok) return;
                delete db.eleves[nom];
                delete db.profils[nom];
                if (db.eleveInfo) delete db.eleveInfo[nom];
                if (_eleveActif && _eleveActif.nom === nom) { _eleveActif = null; updateBandeauEleveActif(); }
                saveDB();
                renderEleves();
                showToast(nom + ' supprimé.', 'info');
            });
            return;
        }

        // Cas 2 : l'élève a des séries dans d'autres disciplines
        if (seriesDansDisc.length > 0) {
            // Il a des séries dans cette discipline → choix complet
            const DISC_LABELS = { 'FU': 'Fosse Universelle', 'DTL': 'Fosse DTL', 'TRAP 1': 'Trap 1', 'PCH': 'Parcours de Chasse', 'CS': 'Compak Sporting' };
            showConfirm(
                nom + ' a ' + seriesDansDisc.length + ' série' + (seriesDansDisc.length > 1 ? 's' : '') + ' en ' + (DISC_LABELS[disc] || disc) + '.\nSupprimer toutes les données de cet élève ?',
                (ok) => {
                    if (!ok) return;
                    delete db.eleves[nom];
                    delete db.profils[nom];
                    if (db.eleveInfo) delete db.eleveInfo[nom];
                    if (db.activeComps) delete db.activeComps[nom];
                    if (_eleveActif && _eleveActif.nom === nom) { _eleveActif = null; updateBandeauEleveActif(); }
                    saveDB();
                    renderEleves();
                    showToast(nom + ' supprimé.', 'info');
                }
            );
            return;
        }

        // Cas 3 : pas de séries dans cette discipline, mais existe ailleurs → retirer de la discipline uniquement
        const DISC_LABELS = { 'FU': 'Fosse Universelle', 'DTL': 'Fosse DTL', 'TRAP 1': 'Trap 1', 'PCH': 'Parcours de Chasse', 'CS': 'Compak Sporting' };
        showConfirm(
            'Retirer ' + nom + ' de la ' + (DISC_LABELS[disc] || disc) + ' ?',
            (ok) => {
                if (!ok) return;
                // Retirer la discipline de eleveInfo.disciplines
                if (db.eleveInfo && db.eleveInfo[nom] && db.eleveInfo[nom].disciplines) {
                    db.eleveInfo[nom].disciplines = db.eleveInfo[nom].disciplines.filter(d => d !== disc);
                }
                // Si plus aucune discipline et plus aucune série → purge complète
                const encorediscs = getDiscsEleve(nom);
                const encoreSeries = (db.eleves[nom] || []).length;
                if (encorediscs.length === 0 && encoreSeries === 0) {
                    delete db.eleves[nom];
                    delete db.profils[nom];
                    if (db.eleveInfo) delete db.eleveInfo[nom];
                }
                if (_eleveActif && _eleveActif.nom === nom && _eleveActif.disc === disc) {
                    // Basculer vers une autre discipline si possible
                    const reste = getDiscsEleve(nom);
                    if (reste.length > 0) {
                        _eleveActif.disc = reste[0];
                    } else {
                        _eleveActif = null;
                    }
                    updateBandeauEleveActif();
                }
                saveDB();
                renderEleves();
                showToast(nom + ' retiré de ' + (DISC_LABELS[disc] || disc) + '.', 'info');
            },
            'RETIRER', 'var(--accent)'
        );
    }

    var _eleveDiscFilter = 'FU'; // discipline sélectionnée dans le filtre élèves
    var _eleveActif = null; // { nom, disc } — élève sélectionné persistant dans toute l'app

    function filtrerDiscEleves(disc, el) {
        _eleveDiscFilter = disc;
        document.querySelectorAll('#disc-filter-bar .disc-tab-relief').forEach(t => t.classList.toggle('active', t.dataset.disc === disc));
        // Si un élève est actif et qu'il est dans la nouvelle discipline, on le garde
        if (_eleveActif) {
            const discs = getDiscsEleve(_eleveActif.nom);
            if (!discs.includes(disc)) {
                // L'élève n'est pas dans cette discipline → on efface la sélection
                _eleveActif = null;
                updateBandeauEleveActif();
            } else {
                // Mettre à jour la discipline du contexte
                _eleveActif.disc = disc;
                updateBandeauEleveActif();
            }
        }
        renderEleves();
    }

    function renderEleves() {
        const container = document.getElementById('dossiers-eleves');
        const wrap = document.getElementById('dossiers-eleves-wrap');
        if (!container) return;
        container.innerHTML = '';

        const DISC_LABELS = { 'FU': 'Fosse Universelle', 'DTL': 'Fosse DTL', 'TRAP 1': 'Trap 1', 'PCH': 'Parcours de Chasse', 'CS': 'Compak Sporting' };

        // Récupérer le texte de recherche (insensible à la casse)
        const searchInput = document.getElementById('recherche-eleve');
        const search = searchInput ? searchInput.value.trim().toLowerCase() : '';

        // Pas de recherche = tuile cachée
        if (!search) {
            if (wrap) wrap.style.display = 'none';
            return;
        }
        if (wrap) wrap.style.display = '';

        // Disciplines filtrée
        const disc = _eleveDiscFilter;

        // Collecter tous les élèves de la discipline filtrée
        const elevesDansDisc = [];
        Object.keys(db.eleves).forEach(nom => {
            const series = db.eleves[nom] || [];
            const seriesDisc = series.filter(s => s.disc === disc);
            const estPreAssigne = db.eleveInfo && db.eleveInfo[nom] && db.eleveInfo[nom].disciplines && db.eleveInfo[nom].disciplines.includes(disc);

            if (seriesDisc.length > 0 || estPreAssigne) {
                let moyenne = 0;
                if (seriesDisc.length > 0) {
                    const pcts = seriesDisc.map(s => Math.round(parseInt(s.score) / maxParSerie(s.disc) * 100));
                    moyenne = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
                }
                elevesDansDisc.push({ nom, nbSeries: seriesDisc.length, moyenne, preAssigne: estPreAssigne && seriesDisc.length === 0 });
            }
        });

        // Filtrer par recherche (insensible casse)
        const elevesFiltres = elevesDansDisc.filter(e => e.nom.toLowerCase().includes(search));

        // Trier : pré-assignés sans série en dernier, puis par moyenne décroissante
        elevesFiltres.sort((a, b) => {
            if (a.preAssigne !== b.preAssigne) return a.preAssigne ? 1 : -1;
            return b.moyenne - a.moyenne;
        });

        // Si aucun résultat
        if (elevesFiltres.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'disc-folder-empty';
            empty.style.padding = '20px 0';
            empty.textContent = 'Aucun élève trouvé pour "' + search + '"';
            container.appendChild(empty);
            return;
        }

        elevesFiltres.forEach(eleve => {
            const isSelected = _eleveActif && _eleveActif.nom === eleve.nom && _eleveActif.disc === disc;
            const row = document.createElement('div');
            row.className = 'eleve-row' + (isSelected ? ' selected' : '');
            row.innerHTML = `
                <span class="eleve-row-name">${sanitize(eleve.nom)}</span>
                <div class="eleve-row-stats">
                    ${eleve.preAssigne ? '<span style="font-size:0.65rem;color:var(--accent);font-weight:700;">NOUVEAU</span>' : `<span class="eleve-row-pct">${eleve.moyenne}%</span><span class="eleve-row-series">${eleve.nbSeries} série${eleve.nbSeries > 1 ? 's' : ''}</span>`}
                    <span class="eleve-row-check">✓</span>
                    <button class="eleve-row-del" title="Supprimer" data-nom="${sanitize(eleve.nom)}"><svg class="icon-sm" viewBox="0 0 24 24" style="margin:0;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                </div>
            `;
            // Clic sur la ligne → sélectionner l'élève + discipline
            row.onclick = function(e) {
                if (e.target.classList.contains('eleve-row-del')) return;
                // Toggle sélection : si déjà sélectionné, désélectionner
                if (_eleveActif && _eleveActif.nom === eleve.nom && _eleveActif.disc === disc) {
                    _eleveActif = null;
                } else {
                    _eleveActif = { nom: eleve.nom, disc: disc };
                    currentTireur = eleve.nom;
                    _selectedDisc = disc;
                }
                updateBandeauEleveActif();
                renderEleves();
            };
            // Bouton supprimer — retire de la discipline affichée
            const btnDel = row.querySelector('.eleve-row-del');
            btnDel.onclick = function(e) {
                e.stopPropagation();
                retirerEleveDeDisc(eleve.nom, disc, e);
            };
            container.appendChild(row);
        });
    }

    /* =========================================================
       ANALYSE IA — COACH AUTOMATIQUE
       + Helpers d'auto-génération pour les PDF
    ========================================================= */
    function ensureAnalyseSerie(s) {
        if (!s) return '';
        if (!db.analysesCoach) db.analysesCoach = {};
        const key = 'serie_' + s.id;
        if (db.analysesCoach[key]) return db.analysesCoach[key];
        // Pas en cache → générer et sauvegarder
        const texte = _analyseLocale_serie(s);
        db.analysesCoach[key] = texte;
        saveDB();
        return texte;
    }

    function ensureAnalyseGlobale(nom) {
        if (!nom) return '';
        if (!db.analysesCoach) db.analysesCoach = {};
        if (db.analysesCoach[nom]) return db.analysesCoach[nom];
        const scores = db.eleves[nom] || [];
        if (!scores.length) return '';
        // Pas en cache → générer et sauvegarder
        const texte = _analyseLocale(nom, scores);
        db.analysesCoach[nom] = texte;
        saveDB();
        return texte;
    }

    function _analyseLocale(nom, scores) {
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];

        const allPct = scores.map(s => Math.round(parseInt(s.score)/maxParSerie(s.disc)*100));
        const avg    = Math.round(allPct.reduce((a,b)=>a+b,0)/allPct.length);
        const best   = Math.max(...allPct);
        const worst  = Math.min(...allPct);
        const mid    = Math.floor(allPct.length/2);
        const avgOld = mid > 0 ? allPct.slice(mid).reduce((a,b)=>a+b,0)/(allPct.length-mid) : avg;
        const avgNew = mid > 0 ? allPct.slice(0,mid).reduce((a,b)=>a+b,0)/mid : avg;
        const delta  = avgNew - avgOld;
        const nbSeries = scores.length;
        const tendance = nbSeries < 2 ? 'stable'
            : delta > 4 ? 'progression' : delta < -4 ? 'recul' : 'stable';

        const parDisc = ['FU','DTL','TRAP 1','PCH','CS'].map(d => {
            const list = scores.filter(s => s.disc === d);
            if (!list.length) return null;
            const moy = Math.round(list.reduce((a,b)=>a+parseInt(b.score),0)/list.length / ((d==='FU'||d==='PCH'||d==='CS')?25:75)*100);
            return { disc: d, moy, nb: list.length };
        }).filter(Boolean);

        const meilleurDisc = parDisc.reduce((a,b) => a.moy > b.moy ? a : b, parDisc[0]);
        const moinsDisc    = parDisc.reduce((a,b) => a.moy < b.moy ? a : b, parDisc[0]);

        const avecGrille = scores.filter(s => s.grille && s.grille.length === 25);
        const groupes = ['1-5','6-10','11-15','16-20','21-25'];
        let pointFort = '', pointFaible = '', tauxFort = 0, tauxFaible = 100;
        let postesProblematiques = [];

        if (avecGrille.length) {
            const taux = groupes.map((_, gi) => {
                let hits=0, total=0;
                avecGrille.forEach(s => { for(let i=gi*5;i<gi*5+5;i++){total++;if(s.grille[i]>0)hits++;} });
                return total ? Math.round((hits/total)*100) : 0;
            });
            const maxI = taux.indexOf(Math.max(...taux));
            const minI = taux.indexOf(Math.min(...taux));
            pointFort    = groupes[maxI]; tauxFort    = taux[maxI];
            pointFaible  = groupes[minI]; tauxFaible  = taux[minI];
            postesProblematiques = groupes.filter((_,i) => taux[i] < 60);
        }

        const ecart = Math.round(Math.sqrt(allPct.reduce((a,b) => a+(b-avg)**2, 0)/allPct.length));
        const irregulier = ecart > 12;

        const niveauMots = avg >= 85 ? ['excellent','très solide','remarquable']
            : avg >= 70 ? ['bon','régulier','fiable']
            : avg >= 55 ? ['correct','en développement','encourageant']
            : ['perfectible','à construire','en progression'];

        // 🎯 ADAPTATION : 1 seule série → pas de comparaison meilleure/moins bonne, ni de "stable/homogène"
        // 🎯 ADAPTATION : 100% global → pas de "meilleure/moins bonne" ni de "franchir un palier"
        let tendanceMots;
        let texte;

        if (avg === 100) {
            // Cas spécial : toutes les séries sont parfaites
            texte = `${nom} présente un niveau exceptionnel avec une moyenne de 100% sur ${nbSeries} série(s). `;
            texte += nbSeries === 1
                ? 'Une série parfaite qui pose les bases d\'un très bon niveau. Les prochaines séries confirmeront cette régularité.'
                : 'Toutes les séries sont parfaites — la régularité est totale. L\'objectif est maintenant de maintenir ce niveau en compétition.';
        } else if (nbSeries === 1) {
            tendanceMots = ['sur cette première série de référence','sur cette séance qui servira de base'];
            texte = `${nom} présente un niveau ${pick(niveauMots)} avec un score de ${avg}%${pick(tendanceMots)}. Les prochaines séries permettront de confirmer cette tendance.`;
        } else {
            if (tendance === 'progression') {
                tendanceMots = [`avec une progression nette de +${Math.round(delta)}% sur les dernières séries`,'en nette amélioration sur les séances récentes'];
            } else if (tendance === 'recul') {
                tendanceMots = ['avec une légère baisse de régularité à surveiller','avec quelques séances en retrait par rapport aux meilleures performances'];
            } else {
                tendanceMots = ['avec un niveau stable et homogène','avec une bonne constance dans les résultats'];
            }
            texte = `${nom} présente un niveau ${pick(niveauMots)} avec une moyenne de ${avg}% (meilleure série : ${best}%, moins bonne : ${worst}%), ${pick(tendanceMots)}.`;
        }

        if (parDisc.length > 1) {
            texte += ` La ${meilleurDisc.disc} est la discipline la mieux maîtrisée (${meilleurDisc.moy}%)`;
            if (moinsDisc.disc !== meilleurDisc.disc) texte += `, tandis que la ${moinsDisc.disc} reste l'axe de travail prioritaire (${moinsDisc.moy}%).`;
            else texte += '.';
        }

        if (pointFort) {
            texte += ` Sur les grilles enregistrées, les tirs ${pointFort} sont les plus maîtrisés (${tauxFort}% de réussite)`;
            if (tauxFaible < 70) texte += `, tandis que les tirs ${pointFaible} constituent le point faible principal (${tauxFaible}%).`;
            else texte += '.';
        }

        // 🎯 ADAPTATION : irrégularité n'a de sens qu'avec ≥ 2 séries
        if (irregulier && nbSeries >= 2) {
            texte += ` ${pick(['La régularité est le principal chantier','L\'irrégularité des résultats mérite attention'])} : un écart de ${ecart}% de réussite entre les séries indique des variations importantes selon les séances.`;
        }

        // 🎯 Recommandations — adaptées au niveau
        if (avg === 100) {
            texte += ' L\'objectif est de maintenir cette excellence et de la reproduire en conditions de compétition.';
        } else if (postesProblematiques.length) {
            texte += ` Conseil prioritaire : travailler en répétition sur les tirs ${postesProblematiques.join(' et ')} en variant les angles de sortie pour renforcer les automatismes sur ces zones.`;
        } else if (tendance === 'stable' && avg >= 70) {
            texte += ` Pour franchir un palier, ${pick(['intensifier le travail sur la gestion du stress en compétition','varier les conditions d\'entraînement pour sortir de la zone de confort','travailler la constance sur la totalité des 25 tirs sans relâchement en fin de série'])}.`;
        } else {
            texte += ` La priorité est de ${pick(['consolider les bases techniques','répéter les fondamentaux sur chaque poste','travailler la régularité avant de chercher la performance'])}.`;
        }

        return texte;
    }

    /* =========================================================
       ANALYSE SÉRIE INDIVIDUELLE
    ========================================================= */
    var _currentSerie = null;

    function ouvrirAnalyseSerie(serie) {
        _currentSerie = serie;
        const max = maxParSerie(serie.disc);
        const pct = Math.round((parseInt(serie.score) / max) * 100);

        document.getElementById('modal-serie-titre').textContent =
            serie.tireur + ' — ' + serie.disc + (serie.poste ? ' · Poste ' + serie.poste : '');
        document.getElementById('modal-serie-sous-titre').textContent = serie.date;
        document.getElementById('modal-serie-badge').textContent = 'SCORE : ' + serie.score + ' / ' + max + ' (' + pct + '%)';

        const saved = db.analysesCoach?.['serie_' + serie.id] || '';
        document.getElementById('modal-serie-texte').value = saved;
        document.getElementById('modal-serie-status').textContent = saved ? '✓ Analyse sauvegardée — modifiez-la si besoin' : '';
        document.getElementById('btn-generer-serie').textContent = saved ? '↺ Régénérer' : '✨ Analyser';
        document.getElementById('modal-serie-loading').style.display = 'none';

        document.getElementById('modal-analyse-serie').style.display = 'flex';
    }

    function fermerAnalyseSerie() {
        document.getElementById('modal-analyse-serie').style.display = 'none';
        _currentSerie = null;
    }

    function sauvegarderAnalyseSerie() {
        if (!_currentSerie) return;
        const texte = document.getElementById('modal-serie-texte').value;
        if (!db.analysesCoach) db.analysesCoach = {};
        db.analysesCoach['serie_' + _currentSerie.id] = texte;
        saveDB();
    }

    function genererAnalyseSerie() {
        if (!_currentSerie) return;

        const btn      = document.getElementById('btn-generer-serie');
        const textarea = document.getElementById('modal-serie-texte');
        const status   = document.getElementById('modal-serie-status');

        const texte = _analyseLocale_serie(_currentSerie);
        textarea.value = texte;

        if (!db.analysesCoach) db.analysesCoach = {};
        db.analysesCoach['serie_' + _currentSerie.id] = texte;
        saveDB();

        status.textContent = '✓ Analyse générée — modifiez-la si besoin';
        btn.textContent = '↺ Régénérer';
    }

    /* =========================================================
       MOTEUR D'ANALYSE AVANCÉ — NIVEAU COACH PROFESSIONNEL
    ========================================================= */
    
    // Utilitaires
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const round1 = n => Math.round(n * 10) / 10;
    
    // Calculer les statistiques avancées d'un élève
    function _calculerStatsEleve(tireur, disc = null) {
        const scores = db.eleves[tireur] || [];
        const filtres = disc ? scores.filter(s => s.disc === disc) : scores;
        
        if (!filtres.length) return null;
        
        const pcts = filtres.map(s => Math.round(parseInt(s.score) / maxParSerie(s.disc) * 100));
        
        const moyenne = pcts.reduce((a,b) => a+b, 0) / pcts.length;
        const meilleure = Math.max(...pcts);
        const pire = Math.min(...pcts);
        
        // Écart-type (régularité)
        const variance = pcts.reduce((a, b) => a + Math.pow(b - moyenne, 2), 0) / pcts.length;
        const ecartType = Math.sqrt(variance);
        
        // Tendance sur les 5 dernières séries
        const dernieres = pcts.slice(0, 5);
        const anciennes = pcts.slice(5, 10);
        let tendance = 'stable';
        if (dernieres.length >= 3 && anciennes.length >= 2) {
            const moyRecente = dernieres.reduce((a,b) => a+b, 0) / dernieres.length;
            const moyAncienne = anciennes.reduce((a,b) => a+b, 0) / anciennes.length;
            if (moyRecente > moyAncienne + 5) tendance = 'progression';
            else if (moyRecente < moyAncienne - 5) tendance = 'baisse';
        }
        
        // Profil de tireur
        let profil = 'en-developpement';
        if (ecartType < 5 && moyenne >= 70) profil = 'regulier';
        else if (ecartType > 12) profil = 'irregulier';
        else if (meilleure >= 90 && moyenne < 70) profil = 'explosif';
        else if (moyenne >= 85) profil = 'expert';
        else if (moyenne >= 70) profil = 'confirme';
        
        return { moyenne, meilleure, pire, ecartType, tendance, profil, nbSeries: filtres.length, pcts };
    }
    
    // Analyser les patterns récurrents
    function _analyserPatterns(tireur, disc) {
        const scores = db.eleves[tireur] || [];
        const series = scores.filter(s => s.disc === disc && s.grille && s.grille.length === 25);

        if (series.length < 2) return null;

        const estPCHCS = DISC_DOUBLES.includes(disc);

        // --- Zones faibles récurrentes ---
        var zonesTaux, zonesTotal, zonesLabels, zonesPct, zoneFaible, zoneForte;

        if (estPCHCS) {
            // PCH/CS : zones par postes réels via grilleToMenuMap
            var postesSet = new Set();
            series.forEach(function(s) {
                var map = grilleToMenuMap(s.menuPCH);
                if (map) {
                    for (var i = 0; i < 25; i++) {
                        if (map[i] && map[i].poste) postesSet.add(map[i].poste);
                    }
                }
            });
            var posteList = Array.from(postesSet).sort(function(a,b){return a-b;});
            if (posteList.length === 0) posteList = [1,2,3,4,5];
            var nbZ = posteList.length;
            zonesTaux = new Array(nbZ).fill(0);
            zonesTotal = new Array(nbZ).fill(0);
            zonesLabels = posteList.map(function(p) { return 'P' + p; });

            series.forEach(function(s) {
                var map = grilleToMenuMap(s.menuPCH);
                if (map) {
                    for (var i = 0; i < 25; i++) {
                        var item = map[i];
                        if (!item) continue;
                        var idx = posteList.indexOf(item.poste);
                        if (idx >= 0) { zonesTotal[idx]++; if (s.grille[i] > 0) zonesTaux[idx]++; }
                    }
                } else {
                    for (var g = 0; g < nbZ; g++) {
                        for (var j = g * 5; j < g * 5 + 5 && j < 25; j++) {
                            zonesTotal[g]++;
                            if (s.grille[j] > 0) zonesTaux[g]++;
                        }
                    }
                }
            });
        } else {
            // FU/DTL/TRAP1 : groupes de 5 plateaux
            zonesTaux = [0, 0, 0, 0, 0];
            zonesTotal = [0, 0, 0, 0, 0];
            series.forEach(s => {
                for (let g = 0; g < 5; g++) {
                    for (let i = g * 5; i < g * 5 + 5; i++) {
                        zonesTotal[g]++;
                        if (s.grille[i] > 0) zonesTaux[g]++;
                    }
                }
            });
            zonesLabels = ['1-5', '6-10', '11-15', '16-20', '21-25'];
        }

        zonesPct = zonesTaux.map((h, i) => zonesTotal[i] > 0 ? Math.round(h / zonesTotal[i] * 100) : 0);
        zoneFaible = zonesPct.indexOf(Math.min(...zonesPct));
        zoneForte  = zonesPct.indexOf(Math.max(...zonesPct));

        // --- Tirs récurrents ratés (tir précis raté dans 60%+ des séries) ---
        const tirsRatesFreq = [];
        for (let i = 0; i < 25; i++) {
            const nbRates = series.filter(s => s.grille[i] === 0).length;
            const freq = Math.round((nbRates / series.length) * 100);
            if (freq >= 60) tirsRatesFreq.push({ tir: i + 1, freq });
        }
        tirsRatesFreq.sort((a, b) => b.freq - a.freq);

        // --- Corrélation poste réel / ratés ---
        var postesRates, postesTotal, postesTaux, posteCritique, posteCritiquePct;

        if (estPCHCS) {
            // PCH/CS : via grilleToMenuMap
            var pSet = new Set();
            series.forEach(function(s) {
                var map = grilleToMenuMap(s.menuPCH);
                if (map) {
                    for (var i = 0; i < 25; i++) {
                        if (map[i] && map[i].poste) pSet.add(map[i].poste);
                    }
                }
            });
            var pList = Array.from(pSet).sort(function(a,b){return a-b;});
            if (pList.length === 0) pList = [1,2,3,4,5];
            var nbP = pList.length;
            postesRates = new Array(nbP).fill(0);
            postesTotal = new Array(nbP).fill(0);

            series.forEach(function(s) {
                var map = grilleToMenuMap(s.menuPCH);
                if (map) {
                    for (var i = 0; i < 25; i++) {
                        var item = map[i];
                        if (!item) continue;
                        var idx = pList.indexOf(item.poste);
                        if (idx >= 0 && idx < nbP) {
                            postesTotal[idx]++;
                            if (s.grille[i] === 0) postesRates[idx]++;
                        }
                    }
                } else {
                    s.grille.forEach(function(val, i) {
                        var p = Math.min(Math.floor(i / 5), nbP - 1);
                        if (p >= 0 && p < nbP) { postesTotal[p]++; if (val === 0) postesRates[p]++; }
                    });
                }
            });
            postesTaux = postesTotal.map((t, i) => t > 0 ? Math.round((postesRates[i] / t) * 100) : 0);
            posteCritique = postesTaux.indexOf(Math.max(...postesTaux));
            posteCritiquePct = postesTaux[posteCritique];
        } else {
            // FU/DTL/TRAP1 : calcul classique
            postesRates = [0, 0, 0, 0, 0];
            postesTotal = [0, 0, 0, 0, 0];
            series.forEach(s => {
                s.grille.forEach((val, i) => {
                    const p = calculerPoste(i + 1, disc, s.poste) - 1;
                    if (p >= 0 && p < 5) {
                        postesTotal[p]++;
                        if (val === 0) postesRates[p]++;
                    }
                });
            });
            postesTaux = postesTotal.map((t, i) => t > 0 ? Math.round((postesRates[i] / t) * 100) : 0);
            posteCritique = postesTaux.indexOf(Math.max(...postesTaux));
            posteCritiquePct = postesTaux[posteCritique];
        }

        // --- Comparaison météo / performance ---
        const seriesVent = { faible: [], modere: [], fort: [] };
        series.forEach(s => {
            const v = s.vent || 'faible';
            const p = Math.round(parseInt(s.score) / maxParSerie(disc) * 100);
            if (seriesVent[v]) seriesVent[v].push(p);
        });
        const moyVent = {};
        Object.keys(seriesVent).forEach(v => {
            if (seriesVent[v].length >= 2)
                moyVent[v] = Math.round(seriesVent[v].reduce((a,b)=>a+b,0)/seriesVent[v].length);
        });
        let impactVent = null;
        if (moyVent.faible && moyVent.fort) {
            const delta = moyVent.faible - moyVent.fort;
            if (Math.abs(delta) >= 5) impactVent = { delta, meilleur: delta > 0 ? 'faible' : 'fort' };
        } else if (moyVent.faible && moyVent.modere) {
            const delta = moyVent.faible - moyVent.modere;
            if (Math.abs(delta) >= 5) impactVent = { delta, meilleur: delta > 0 ? 'faible' : 'modere' };
        }

        // --- Ratés consécutifs récurrents ---
        let totalConsec = 0, nbSeriesAvecConsec = 0;
        series.forEach(s => {
            let consec = 0, maxC = 0;
            s.grille.forEach(v => {
                if (v === 0) { consec++; maxC = Math.max(maxC, consec); }
                else consec = 0;
            });
            if (maxC >= 2) { totalConsec += maxC; nbSeriesAvecConsec++; }
        });

        return {
            zoneFaible: zonesLabels[zoneFaible],
            zoneFaiblePct: zonesPct[zoneFaible],
            zoneForte: zonesLabels[zoneForte],
            zoneFortePct: zonesPct[zoneForte],
            zonesPct,
            tirsRatesFreq,
            posteCritique: posteCritique + 1,
            posteCritiquePct,
            postesTaux,
            impactVent,
            moyVent,
            aProblemeConsec: nbSeriesAvecConsec > series.length * 0.4,
            moyenneConsec: nbSeriesAvecConsec ? round1(totalConsec / nbSeriesAvecConsec) : 0,
            nbSeries: series.length
        };
    }

    function _analyseLocale_serie(s) {
        const max  = (s.disc === 'FU' || s.disc === 'PCH' || s.disc === 'CS') ? 25 : 75;
        const pct  = Math.round((parseInt(s.score)/max)*100);
        const nom  = s.tireur || 'Tireur';
        const posteStr = s.poste ? ` depuis le poste ${s.poste}` : '';
        const estGaucher = (db.eleveInfo && db.eleveInfo[nom] && db.eleveInfo[nom].lateralite === 'gaucher');

        // ═══════════════════════════════════════════════════════════
        // RÉCUPÉRER L'HISTORIQUE DE L'ÉLÈVE
        // ═══════════════════════════════════════════════════════════
        const statsEleve = _calculerStatsEleve(nom, s.disc);
        const patterns = _analyserPatterns(nom, s.disc);
        
        // Contexte météo/vent
        const ventCtx = { fort: ' par vent fort', modere: ' par vent modéré', faible: '' };
        const ventSuffix = s.vent ? (ventCtx[s.vent] || '') : '';
        let meteoSuffix = '';
        if (s.meteoAPI?.desc?.includes('Pluie') || s.meteoAPI?.desc?.includes('Averse')) {
            meteoSuffix = ' sous la pluie';
        }
        const conditionSuffix = ventSuffix || meteoSuffix;

        // ═══════════════════════════════════════════════════════════
        // CAS SPÉCIAL : SÉRIE PARFAITE (100%)
        // ═══════════════════════════════════════════════════════════
        if (pct === 100) {
            let texte = `🏆 ${nom}, SÉRIE PARFAITE ! ${s.score}/${max}${posteStr} en ${s.disc}${conditionSuffix} — aucun plateau raté !\n\n`;
            
            // Comparaison avec l'historique
            if (statsEleve) {
                const nbParfaites = statsEleve.pcts.filter(p => p === 100).length;
                if (nbParfaites === 1) {
                    texte += `C'est ta PREMIÈRE série parfaite ! Une performance exceptionnelle qui marque une étape importante.\n\n`;
                } else {
                    var ord = nbParfaites === 1 ? '1ère' : nbParfaites + 'ème';
                    texte += `C'est ta ${ord} série parfaite, tu confirmes ton niveau !\n\n`;
                }
            }
            
            texte += `Maîtrise totale du début à la fin, concentration impeccable, technique au point. Ce type de série est rare, savoure ce moment ! 🏆\n\n`;
            
            // Objectif suivant
            if (statsEleve && statsEleve.profil !== 'regulier') {
                texte += `🎯 Objectif : enchaîner les séries parfaites. L'excellence se mesure à la régularité, pas aux coups d'éclat.`;
            } else {
                texte += `🎯 Défi : reproduire cette performance en compétition, sous la pression. Tu as prouvé que tu sais faire.`;
            }
            
            return texte;
        }

        // ═══════════════════════════════════════════════════════════
        // ANALYSE DÉTAILLÉE DE LA SÉRIE
        // ═══════════════════════════════════════════════════════════
        
        // Métriques de la série
        const groupes = ['1-5', '6-10', '11-15', '16-20', '21-25'];
        const taux = groupes.map((_, gi) => {
            let h = 0;
            for (let i = gi * 5; i < gi * 5 + 5; i++) { if (s.grille[i] > 0) h++; }
            return Math.round(h / 5 * 100);
        });
        
        const maxI = taux.indexOf(Math.max(...taux));
        const minI = taux.indexOf(Math.min(...taux));
        
        // Analyse temporelle
        const pctDebut = Math.round(s.grille.slice(0, 8).filter(v => v > 0).length / 8 * 100);
        const pctMilieu = Math.round(s.grille.slice(8, 17).filter(v => v > 0).length / 9 * 100);
        const pctFin = Math.round(s.grille.slice(17, 25).filter(v => v > 0).length / 8 * 100);
        
        // Détection des patterns
        const ecartMaxPhases = Math.max(pctDebut, pctMilieu, pctFin) - Math.min(pctDebut, pctMilieu, pctFin);
        const fatigue = pctFin < pctDebut - 20;
        const montee = pctFin > pctDebut + 20;
        const trouMilieu = pctMilieu < pctDebut - 20 && pctFin >= pctMilieu;
        const demarrageDifficile = pctDebut < pctMilieu - 15 && pctDebut < pctFin - 15;
        const serieHomogene = ecartMaxPhases <= 15;
        
        // Ratés consécutifs
        let maxConsec = 0, encours = 0, debutPire = 0, tmpDebut = 0, positionsRatés = [];
        s.grille.forEach((v, i) => {
            if (v === 0) {
                positionsRatés.push(i + 1);
                if (encours === 0) tmpDebut = i + 1;
                encours++;
                if (encours > maxConsec) { maxConsec = encours; debutPire = tmpDebut; }
            } else { encours = 0; }
        });
        const finPire = debutPire + maxConsec - 1;
        
        // Deuxièmes coups (DTL/TRAP)
        const deuxiemeCoup = s.disc !== 'FU' ? s.grille.map((v, i) => v === 2 ? i + 1 : null).filter(Boolean) : [];
        
        // ═══════════════════════════════════════════════════════════
        // GÉNÉRATION DU TEXTE
        // ═══════════════════════════════════════════════════════════
        
        let texte = '';
        
        // --- ACCROCHE avec comparaison historique ---
        const premiereSerie = !statsEleve || statsEleve.nbSeries <= 1;
        
        if (premiereSerie) {
            texte = `${nom}, ${s.score}/${max} (${pct}%)${posteStr} en ${s.disc}${conditionSuffix}\n\n`;
            if (pct >= 85) {
                texte += `Première série enregistrée et déjà un très beau score ! Elle servira de référence pour les prochaines analyses.\n\n`;
            } else if (pct >= 70) {
                texte += `Première série enregistrée ! Un bon point de départ qui servira de référence. Les prochaines séries nous permettront d'identifier tes axes de progression.\n\n`;
            } else {
                texte += `Première série enregistrée ! Elle servira de référence. Pas de conclusion hâtive sur une seule série, on affine avec les prochaines.\n\n`;
            }
        } else if (statsEleve) {
            const ecartMoyenne = pct - statsEleve.moyenne;
            const rang = statsEleve.pcts.sort((a,b) => b-a).indexOf(pct) + 1;
            
            if (pct === statsEleve.meilleure && statsEleve.nbSeries > 1) {
                texte = `🌟 ${nom}, ÉGALISATION DE TON RECORD ! ${s.score}/${max} (${pct}%)${posteStr} en ${s.disc}${conditionSuffix}\n\n`;
                texte += `Tu égalles ta meilleure série ! `;
            } else if (pct >= statsEleve.meilleure - 5 && pct !== statsEleve.meilleure) {
                texte = `🔥 ${nom}, EXCELLENTE SÉRIE ! ${s.score}/${max} (${pct}%)${posteStr} en ${s.disc}${conditionSuffix}\n\n`;
                texte += `À ${pct}%, tu es à ${round1(Math.abs(ecartMoyenne))}% ${ecartMoyenne >= 0 ? 'au-dessus' : 'en dessous'} de ta moyenne habituelle (${round1(statsEleve.moyenne)}%). `;
            } else if (ecartMoyenne > 10) {
                texte = `📈 ${nom}, BELLE PROGRESSION ! ${s.score}/${max} (${pct}%)${posteStr} en ${s.disc}${conditionSuffix}\n\n`;
                texte += `Série bien au-dessus de ta moyenne (${round1(statsEleve.moyenne)}%), tu gagnes ${round1(ecartMoyenne)}% de réussite ! `;
            } else if (ecartMoyenne < -10) {
                texte = `${nom}, ${s.score}/${max} (${pct}%)${posteStr} en ${s.disc}${conditionSuffix}\n\n`;
                texte += `Cette série est en dessous de ton niveau habituel (${round1(statsEleve.moyenne)}% de moyenne). Pas de panique, analysons ensemble ce qui s'est passé. `;
            } else {
                texte = `${nom}, ${s.score}/${max} (${pct}%)${posteStr} en ${s.disc}${conditionSuffix}\n\n`;
                texte += `Performance dans ta moyenne (${round1(statsEleve.moyenne)}%), du classique pour toi. `;
            }
            
            // Ajouter la tendance
            if (statsEleve.tendance === 'progression') {
                texte += `Tu es en phase de progression ces derniers temps, continue !\n\n`;
            } else if (statsEleve.tendance === 'baisse') {
                texte += `Attention, tes dernières séries montrent une légère baisse, on va redresser la barre.\n\n`;
            } else {
                texte += `\n\n`;
            }
        }
        
        // --- ANALYSE DU DÉROULÉ ---
        texte += `📊 DÉROULÉ DE LA SÉRIE\n`;
        
        if (trouMilieu) {
            texte += `• Départ ${pctDebut}% → trou d'air au milieu (${pctMilieu}%) → remontée en fin (${pctFin}%)\n`;
            texte += `  ⚠️ Le passage à vide sur les tirs 9-17 a coûté cher. C'est souvent là que la confiance vacille.\n`;
        } else if (fatigue) {
            texte += `• Départ ${pctDebut}% → fin à ${pctFin}% (baisse de ${pctDebut - pctFin}% de réussite)\n`;
            texte += `  ⚠️ Baisse de régime en fin de série. La fatigue mentale ou un relâchement de concentration ?\n`;
        } else if (montee) {
            texte += `• Départ prudent (${pctDebut}%) → montée en puissance → fin à ${pctFin}%\n`;
            texte += `  ✓ Tu as mis du temps à entrer dans la série mais tu as fini fort. L'inverse peut aussi arriver...\n`;
        } else if (demarrageDifficile) {
            texte += `• Départ difficile (${pctDebut}%) → amélioration progressive\n`;
            texte += `  ⚠️ Problème de mise en route. Travaille ta routine d'entrée de série.\n`;
        } else if (serieHomogene) {
            texte += `• Début ${pctDebut}% → milieu ${pctMilieu}% → fin ${pctFin}%\n`;
            texte += `  ✓ Série homogène, bonne gestion mentale sur l'ensemble des 25 tirs.\n`;
        } else {
            texte += `• Début ${pctDebut}% → milieu ${pctMilieu}% → fin ${pctFin}%\n`;
            const ecartDetail = ecartMaxPhases >= 20 ? 'un écart notable' : 'quelques variations';
            texte += `  Série avec ${ecartDetail} entre les phases (de ${Math.min(pctDebut, pctMilieu, pctFin)}% à ${Math.max(pctDebut, pctMilieu, pctFin)}%). Pas de pattern alarmant, mais pas parfaitement linéaire non plus.\n`;
        }
        
        // --- ANALYSE DES ZONES ---
        texte += `\n🎯 ANALYSE PAR ZONE\n`;
        
        const zonesFortes = taux.map((t, i) => t >= 80 ? groupes[i] : null).filter(Boolean);
        const zonesFaibles = taux.map((t, i) => t < 60 ? groupes[i] : null).filter(Boolean);
        
        if (zonesFortes.length > 0 && zonesFaibles.length > 0) {
            texte += `• Zones fortes : ${zonesFortes.join(', ')} (${taux[groupes.indexOf(zonesFortes[0])]}%+)\n`;
            texte += `• Zones faibles : ${zonesFaibles.join(', ')} (${taux[groupes.indexOf(zonesFaibles[0])]}%)\n`;
        } else if (zonesFaibles.length > 0) {
            texte += `• Zone à travailler : tirs ${zonesFaibles.join(', ')} à ${taux[minI]}%\n`;
        } else if (zonesFortes.length === 5) {
            if (premiereSerie) {
                texte += `• Toutes les zones sont au-dessus de 80% — très bon score sur l'ensemble de la série !\n`;
            } else {
                texte += `• Toutes les zones sont au-dessus de 80% — belle régularité !\n`;
            }
        } else {
            texte += `• Meilleure zone : ${groupes[maxI]} (${taux[maxI]}%)\n`;
            texte += `• Zone la plus fragile : ${groupes[minI]} (${taux[minI]}%)\n`;
        }
        
        // Comparaison avec patterns historiques
        if (patterns && zonesFaibles.length > 0) {
            if (patterns.zoneFaible === zonesFaibles[0]) {
                texte += `  📍 RÉCURRENCE : Les tirs ${patterns.zoneFaible} sont TA zone faible récurrente (${patterns.zoneFaiblePct}% sur l'ensemble de tes séries). C'est un axe de travail prioritaire.\n`;
            }
        }
        
        // --- ANALYSE DES RATÉS ---
        texte += `\n🔍 ANALYSE DES PLATEAUX RATÉS\n`;
        
        const nbRates = positionsRatés.length;
        
        if (nbRates === 0) {
            texte += `• Aucun plateau raté !\n`;
        } else {
            texte += `• ${nbRates} plateau${nbRates > 1 ? 'x' : ''} raté${nbRates > 1 ? 's' : ''} : ${positionsRatés.join(', ')}\n`;
            
            if (maxConsec >= 3) {
                texte += `  ⚠️ SÉRIE DE ${maxConsec} RATÉS CONSÉCUTIFS (tirs ${debutPire}-${finPire})\n`;
                texte += `     C'est le point noir de cette série. Une fois le premier raté, le doute s'installe et ça s'enchaîne.\n`;
                
                if (patterns?.aProblemeConsec) {
                    texte += `     📍 RÉCURRENCE : Tu as souvent des séries de ratés (moyenne ${patterns.moyenneConsec} consécutifs).\n`;
                    texte += `     Travaille ta capacité à te "réinitialiser" après chaque tir, réussi ou raté.\n`;
                }
            } else if (maxConsec === 2) {
                texte += `  • Deux ratés consécutifs (tirs ${debutPire}-${finPire}) : signal à surveiller.\n`;
            } else {
                texte += `  • Les ratés sont bien répartis, pas d'effet boule de neige.\n`;
            }
        }
        
        // Deuxièmes coups
        if (deuxiemeCoup.length > 0) {
            texte += `\n⚡ TIRS RATTRAPÉS (2ème coup)\n`;
            texte += `• ${deuxiemeCoup.length} tir${deuxiemeCoup.length > 1 ? 's' : ''} : ${deuxiemeCoup.slice(0, 5).join(', ')}${deuxiemeCoup.length > 5 ? '...' : ''}\n`;
            if (deuxiemeCoup.length >= 3) {
                texte += `  ⚠️ Trop de rattrapages = problème d'anticipation. Ton œil doit partir AVANT le bruit de la machine.\n`;
            } else {
                texte += `  À surveiller, mais pas inquiétant.\n`;
            }
        }
        
        // --- PROFIL ET CONSEILS ---
        texte += `\n💡 CONSEILS PERSONNALISÉS\n`;

        // 🌟 NOUVEAU : TON DU COACH SELON LE PROFIL 🌟
        const profilTireur = (db.profils && db.profils[nom]) ? db.profils[nom] : 'Confirmé';
        
        if (profilTireur === 'Débutant') {
            texte += `🌱 Note : Ton objectif principal est d'acquérir les bons automatismes. Oublie le score pour le moment, focalise-toi uniquement sur ta posture, ton placement de regard et la fluidité de ton mouvement.\n`;
        } else if (profilTireur === 'Expert') {
            if (pct < 75) texte += `🔥 Note : Prestation très insuffisante pour ton niveau. Tu es complètement sorti de ton match. Le haut niveau exige une rigueur absolue, ressaisis-toi immédiatement sur ta routine.\n`;
            else if (pct >= 92) texte += `🔥 Note : C'est exactement le niveau d'exigence attendu. Reste intraitable sur ton protocole, aucune baisse de garde n'est permise.\n`;
            else texte += `🔥 Note : Série correcte, mais tu dois aller chercher les quelques points qui font la différence. Sois plus tranchant et agressif sur tes attaques.\n`;
        }
        
        // Déterminer le conseil principal
        let conseilPrincipal = '';
        
        if (maxConsec >= 3 || (patterns?.aProblemeConsec && maxConsec >= 2)) {
            const routines = [
                `Travaille ta routine de RÉINITIALISATION : après chaque tir, souffle 2 secondes, replace tes pieds, recentre ton regard. Chaque plateau = premier plateau.`,
                `Le mental te joue des tours après un raté. Exercice : en entraînement, demande à quelqu'un de faire du bruit inattendu après ton annonce. Apprends à rester concentré quoi qu'il arrive.`,
                `Ton problème n'est pas technique mais mental. La prochaine séance, fixe-toi un seul objectif : accepter le raté et passer immédiatement au plateau suivant.`
            ];
            conseilPrincipal = pick(routines);
        } else if (fatigue) {
            const conseilsFatigue = [
                `La fatigue de fin de série trahit un relâchement. Prochain exercice : fais 30 tirs au lieu de 25 pour habituer ton mental à durer plus longtemps.`,
                `Tu lâches en fin de série. Avant les tirs 18-25, redis-toi "nouvelle série, 0-0" pour garder la même intensité qu'au début.`,
                `Travaille l'endurance mentale : en compétition, la fatigue arrive souvent sur les derniers tirs. Entraîne-toi à finir fort avec des séries de 30.`
            ];
            conseilPrincipal = pick(conseilsFatigue);
        } else if (trouMilieu) {
            const conseilsMilieu = [
                `Le trou d'air du milieu est classique : on se sent bien après un bon départ et on relâche. Reste vigilant sur les tirs 9-17, c'est là que se jouent les grandes séries.`,
                `Sur les tirs 11-15, impose-toi le même rituel strict qu'au tir 1. C'est la zone danger où la concentration baisse souvent.`
            ];
            conseilPrincipal = pick(conseilsMilieu);
        } else if (zonesFaibles.length > 0 && patterns?.zoneFaible === zonesFaibles[0]) {
            const conseilsZone = {
                '1-5': `Les tirs 1-5 restent ton point faible récurrent. Travaille spécifiquement ton placement de départ, ta position de pieds, ta vision centrale AVANT l'annonce.`,
                '6-10': `Les tirs 6-10 te posent problème régulièrement. Concentre-toi sur la lecture de trajectoire latérale, prends plus d'avance sur ces angles.`,
                '11-15': `La zone 11-15 est ton talon d'Achille. C'est souvent là que la routine s'installe mal. Répète ces tirs en série isolée.`,
                '16-20': `Les tirs 16-20 te coûtent cher. C'est la zone de fatigue mentale. Entraîne-toi à rester hyper vigilant sur ce passage.`,
                '21-25': `Les derniers tirs (21-25) restent difficiles pour toi. La fin de série n'est pas une formalité, garde la même intensité qu'au tir 1.`
            };
            conseilPrincipal = conseilsZone[patterns.zoneFaible];
        } else if (deuxiemeCoup.length >= 3) {
            const conseilsAnticipation = [
                `Trop de deuxièmes coups : attention à ne pas "jeter tes canons" à l'appel. Tu pars probablement sur une trajectoire imaginaire avant d'avoir lu le plateau. Verrouille ton fusil, appelle, lis la trajectoire, puis attaque.`,
                `Beaucoup de rattrapages. Le défaut classique : tu déclenches ton mouvement en même temps que tu dis "pull". Attends impérativement de VOIR le plateau sortir avant de bouger tes canons.`,
                `Les tirs au second coup montrent souvent une anticipation erronée. Tu pars "à l'aveugle" au moment de l'appel. Laisse le plateau sortir de la fosse, identifie sa direction exacte, et lance ton swing seulement après.`
            ];
            conseilPrincipal = pick(conseilsAnticipation);
        } else if (pct >= 85) {
            const conseilsExpert = [
                `Tu as le niveau pour viser 90%+. Maintenant c'est la régularité qui compte : enchaîne 3 séries à ce niveau-là.`,
                `Techniquement au point, le défi est mental. Travaille la gestion de la pression en simulant des conditions de compétition.`,
                `Ton score est solide. Pour progresser, travaille ta constance : l'objectif est de faire ce score MINIMUM à chaque séance.`
            ];
            conseilPrincipal = pick(conseilsExpert);
        } else {
            const conseilsGeneraux = [
                `Prochain objectif : ${Math.min(pct + 8, 95)}%. Concentre-toi sur la régularité plutôt que sur la performance pure.`,
                `Pour progresser, identifie UN point à améliorer (technique, mental, routine) et travaille-le spécifiquement à la prochaine séance.`,
                `La clé est dans les détails : position, respiration, tempo d'annonce. Relis ta routine et cherche les points à affiner.`
            ];
            conseilPrincipal = pick(conseilsGeneraux);
        }
        
        texte += `→ ${conseilPrincipal}\n`;

        // --- 🎯 AJOUT DE LA PRÉCISION IA (SANS RIEN SUPPRIMER) ---
        let complementsIA = "";

        // 🌟 NOUVEAU MOTEUR DIRECTIONS (PSEUDO-IA) 🌟
        if (s.directions && s.directions.length === 25) {
            let statsDir = { 'X': { 'G': 0, 'dG': 0, 'C': 0, 'dD': 0, 'D': 0 }, '0': { 'G': 0, 'dG': 0, 'C': 0, 'dD': 0, 'D': 0 } };
            let totalDir0 = 0, totalDirX = 0;
            
            s.grille.forEach((val, i) => {
                const dir = s.directions[i];
                if (dir) {
                    if (val === 2) { statsDir['X'][dir] = (statsDir['X'][dir] || 0) + 1; totalDirX++; }
                    else if (val === 0) { statsDir['0'][dir] = (statsDir['0'][dir] || 0) + 1; totalDir0++; }
                }
            });

            let defautsDir = [
                { poids: statsDir['0']['G'] + statsDir['0']['D'], texte: "Gros blocage mécanique sur les angles extrêmes (Gauche/Droite). Vérifie ton placement de pieds au départ, tu es probablement 'enfermé' et tu bloques ta rotation du bassin." },
                { poids: statsDir['X']['G'] + statsDir['X']['D'], texte: "Tu rattrapes tes extrêmes au second coup, ce qui prouve que tu es en retard sur l'attaque. Ne jette pas tes canons, verrouille ta trajectoire avant de tirer." },
                { poids: statsDir['0']['dG'] + statsDir['0']['dD'], texte: "Les demi-angles te posent problème. C'est souvent une erreur d'anticipation : tu pars trop fort en pensant que c'est un extrême, et tu passes devant. Ralentis ton attaque." },
                { poids: statsDir['X']['dG'] + statsDir['X']['dD'], texte: "Beaucoup de corrections sur les demi-angles. Tu hésites sur la lecture de la trajectoire au premier coup. Fais confiance à tes yeux." },
                { poids: statsDir['0']['C'], texte: "Attention aux pertes de points sur les fuyants de face. Tu as tendance à arrêter ton fusil au moment du tir ou à décoller la joue de la crosse. Traverse ton plateau !" },
                { poids: statsDir['X']['C'], texte: "Tu te fais surprendre par la vitesse des fuyants de face. Ton premier coup est souvent en dessous. Attaque-les plus franchement." }
            ];

            defautsDir.sort((a, b) => b.poids - a.poids);

            // Diagnostic asymétrique : seuil plus élevé pour éviter les conclusions hâtives
            const ratésGauche = statsDir['0']['G'] + statsDir['0']['dG'];
            const ratésDroite = statsDir['0']['D'] + statsDir['0']['dD'];
            const asyGauche = ratésGauche >= 4 && ratésDroite === 0;
            const asyDroite = ratésDroite >= 4 && ratésGauche === 0;
            const asyTendance = totalDir0 >= 3 && !asyGauche && !asyDroite && (ratésGauche >= 2 && ratésDroite === 0 || ratésDroite >= 2 && ratésGauche === 0);
            
            if (asyDroite) {
                const piedBlocDroite = estGaucher ? 'pied droit' : 'pied gauche';
                complementsIA += "\n🎯 DIAGNOSTIC : Problème asymétrique net — tous tes ratés partent à droite, ta rotation est bloquée de ce côté. Pré-positionne ton " + piedBlocDroite + " légèrement en avant pour libérer ton bassin et gagner de l'amplitude vers la droite.";
            } else if (asyGauche) {
                const piedBlocGauche = estGaucher ? 'pied gauche' : 'pied droit';
                complementsIA += "\n🎯 DIAGNOSTIC : Problème asymétrique net — tous tes ratés partent à gauche, ta rotation est bloquée de ce côté. Pré-positionne ton " + piedBlocGauche + " légèrement en avant pour libérer ton bassin et gagner de l'amplitude vers la gauche.";
            } else if (asyTendance) {
                const cote = ratésGauche > ratésDroite ? 'gauche' : 'droite';
                complementsIA += "\n🎯 TENDANCE : Tes ratés semblent se concentrer du côté " + cote + ". Pas assez de données pour un diagnostic ferme, mais à surveiller sur les prochaines séries.";
            } else if (defautsDir[0].poids >= 2) {
                complementsIA += "\n🎯 DIAGNOSTIC : " + defautsDir[0].texte;
            }
        }
        
        // Stress du début (Le démarrage à froid)
        if (s.grille.slice(0, 3).filter(v => v === 0).length >= 2) {
            complementsIA += "\n⚠️ DÉMARRAGE : Problème d'entrée dans la série. Ne rentre pas dans la fosse en touriste. Avant d'appeler ton premier plateau, fais ton tir à sec mentalement, visualise ta zone de cassure et verrouille ta respiration.";
        }
        // Syndrome du dernier plateau (Le 25ème)
        if (s.grille[24] === 0 && s.grille[23] > 0) {
            complementsIA += "\n⚠️ FINITION : Le fameux 25ème plateau... Tu as relâché ta tension mentale en pensant déjà au score. Règle d'or : la série ne s'arrête pas au 25ème plateau, elle s'arrête quand ton fusil est ouvert et vide.";
        }
        // Mental (La spirale de l'échec)
        if (maxConsec >= 2) {
            complementsIA += "\n🧠 MENTAL : " + maxConsec + " ratés consécutifs. Apprends à oublier un zéro immédiatement.";
        }
        // Le jargon spécifique DTL vs TRAP 1
        if (s.disc === 'DTL' && s.grille.filter(v => v === 2).length >= 4) {
            complementsIA += "\n⚡ DTL : L'assurance du 2ème coup ne suffit pas, il te coûte des points précieux. Tu dois être plus tranchant et agressif sur ton premier coup. Ton swing doit exploser le plateau, pas le suivre.";
        } else if (s.disc === 'TRAP 1' && s.grille.filter(v => v === 2).length >= 4) {
            complementsIA += "\n⚡ RÉACTIVITÉ : Trop de tirs au 2ème coup. Acquisition lente, ton œil doit accrocher la cible plus vite.";
        }
        // La balistique selon le vent (NOUVEAU)
        if (s.vent === 'fort') {
            complementsIA += "\n🌀 BALISTIQUE : Conditions ventées. N'oublie pas que le vent modifie les trajectoires (un vent de face fait monter les plateaux, un vent de dos les plaque au sol). Adapte ta bande et ton point d'attaque en conséquence, ne subis pas la météo !";
        }

        // Poste critique (analyse géographique)
        const ratésParPoste = [0, 0, 0, 0, 0];
        let totalRatés = 0;
        s.grille.forEach((val, i) => {
            if (val === 0) {
                const p = calculerPoste(i + 1, s.disc, s.poste);
                ratésParPoste[p - 1]++;
                totalRatés++;
            }
        });
        if (totalRatés > 2) {
            const maxRatésPoste = Math.max(...ratésParPoste);
            const posteCoupable = ratésParPoste.indexOf(maxRatésPoste) + 1;
            const ratioPoste = (maxRatésPoste / totalRatés) * 100;
            if (ratioPoste >= 40) {
                complementsIA += "\n📍 POSTE CRITIQUE : " + Math.round(ratioPoste) + "% de tes ratés sont au Poste " + posteCoupable + ". Vérifie ton placement de pieds.";
            }
        }

        // Rattrapage chanceux (dépendance au 2ème coup)
        if (s.disc !== 'FU') {
            const deuxiemes = s.grille.filter(v => v === 2).length;
            const totalHits = s.grille.filter(v => v > 0).length;
            if (totalHits > 0) {
                const ratioChance = (deuxiemes / totalHits) * 100;
                if (deuxiemes >= 5 || ratioChance >= 25) {
                    complementsIA += `\n⚡ RAPPEL TECHNIQUE : ${deuxiemes} tirs sauvés au 2ème coup (${Math.round(ratioChance)}% de tes réussites). Ton score est flatteur mais ta réactivité au 1er coup est insuffisante. Travaille ton agressivité à la sortie du plateau.`;
                }
            }
        }

        if (complementsIA !== "") {
            texte += "\n--- ANALYSE TECHNIQUE ---" + complementsIA + "\n";
        }

        // --- PATTERNS RÉCURRENTS (si historique suffisant) ---
        if (patterns && patterns.nbSeries >= 3) {
            let patternText = '';

            // 1. Tirs précis ratés régulièrement
            if (patterns.tirsRatesFreq.length > 0) {
                const tirsStr = patterns.tirsRatesFreq.slice(0, 4).map(t => `tir ${t.tir} (${t.freq}%)`).join(', ');
                patternText += `\n📊 RÉCURRENCE : Sur tes ${patterns.nbSeries} dernières séries en ${s.disc}, tu rates systématiquement : ${tirsStr}. Ce ne sont pas des accidents — c'est un problème technique à cibler.`;
            }

            // 2. Corrélation poste réel / ratés sur historique
            if (patterns.posteCritiquePct >= 35 && patterns.nbSeries >= 3) {
                const autresPostes = patterns.postesTaux
                    .map((t, i) => ({ p: i+1, t }))
                    .filter(x => x.p !== patterns.posteCritique && x.t > 0)
                    .sort((a,b) => a.t - b.t);
                const meilleurPoste = autresPostes[0];
                patternText += `\n📍 HISTORIQUE POSTES : Sur l'ensemble de tes séries, le poste ${patterns.posteCritique} est ton poste le plus difficile (${patterns.posteCritiquePct}% de ratés)`;
                if (meilleurPoste) patternText += `, contre seulement ${meilleurPoste.t}% au poste ${meilleurPoste.p}`;
                patternText += `. Travaille spécifiquement les angles du poste ${patterns.posteCritique}.`;
            }

            // 3. Impact météo/vent sur performance
            if (patterns.impactVent) {
                const { delta, meilleur } = patterns.impactVent;
                const labelsVent = { faible: 'par temps calme', modere: 'vent modéré', fort: 'vent fort' };
                const pire = meilleur === 'faible' ? (patterns.moyVent.fort !== undefined ? 'fort' : 'modere') : 'faible';
                if (patterns.moyVent[meilleur] && patterns.moyVent[pire]) {
                    patternText += `\n🌤 MÉTÉO : Tes performances varient selon les conditions — ${patterns.moyVent[meilleur]}% ${labelsVent[meilleur]} contre ${patterns.moyVent[pire]}% ${labelsVent[pire]} (écart de ${Math.abs(delta)}% de réussite). Travaille ta technique par vent pour réduire cet écart.`;
                }
            }

            if (patternText) {
                texte += "\n--- ANALYSE HISTORIQUE ---" + patternText + "\n";
            }
        }

        // Objectif chiffré si historique dispo
        if (statsEleve && statsEleve.nbSeries >= 3) {
            const prochainObjectif = pct >= statsEleve.moyenne 
                ? Math.min(Math.round(statsEleve.moyenne) + 5, 95)
                : Math.round(statsEleve.moyenne);
            texte += `\n🎯 Prochain objectif : ${prochainObjectif}% minimum en ${s.disc}`;
            
            if (statsEleve.profil === 'irregulier') {
                texte += ` (ton profil "irrégulier" indique qu'il faut travailler la constance)`;
            }
            texte += `\n`;
        }

        // --- 📋 L'ORDONNANCE D'ENTRAÎNEMENT (Exercice ciblé) ---
        let exercice = "";
        
        // On récupère les stats de directions pour la prescription
        let nbRatésDroite = 0, nbRatésGauche = 0, nbRatésCentre = 0;
        if (s.directions && s.directions.length === 25) {
            s.grille.forEach((val, i) => {
                if (val === 0) {
                    if (s.directions[i] === 'D' || s.directions[i] === 'dD') nbRatésDroite++;
                    if (s.directions[i] === 'G' || s.directions[i] === 'dG') nbRatésGauche++;
                    if (s.directions[i] === 'C') nbRatésCentre++;
                }
            });
        }

        // L'arbre de décision du Coach (Priorité du défaut le plus grave au moins grave)
        // Seuil minimal de ratés pour un diagnostic directionnel fiable
        if (nbRatésDroite >= 4 && nbRatésGauche === 0) {
            const dirPiedsD = estGaucher ? 'vers la gauche (pour pré-charger ton amplitude vers la droite)' : 'vers la droite (pour pré-charger ton amplitude du côté bloqué)';
            exercice = "📍 Blocage à Droite : Place-toi au poste 3, oriente tes pieds de 30 degrés " + dirPiedsD + ". Tire 10 plateaux d'affilée dans cette posture pour mémoriser le mouvement.";
        } else if (nbRatésGauche >= 4 && nbRatésDroite === 0) {
            const dirPiedsG = estGaucher ? 'vers la droite (pour pré-charger ton amplitude vers la gauche)' : 'vers la gauche (pour pré-charger ton amplitude du côté bloqué)';
            exercice = "📍 Blocage à Gauche : Place-toi au poste 3, oriente tes pieds de 30 degrés " + dirPiedsG + ". Tire 10 plateaux d'affilée dans cette posture pour mémoriser le mouvement.";
        } else if (nbRatésCentre >= 3) {
            exercice = "🎯 Le Suivi : Tire 10 fuyants de face d'affilée. Règle d'or : tu dois garder la joue collée à la crosse et le fusil pointé vers les éclats pendant 2 secondes entières APRÈS avoir tiré.";
        } else if (maxConsec >= 2) {
            exercice = "🧠 Reset Mental : La pause forcée. À la prochaine séance, impose-toi cette règle : après chaque raté, tu dois casser ton fusil, le poser sur la pointe de la chaussure, souffler un grand coup (5 sec), et refaire ta routine à 100%.";
        } else if (deuxiemeCoup && deuxiemeCoup.length >= 3) {
            exercice = "👀 Anticipation visuelle : Entraînement 'à blanc'. Épaule ton fusil (vide). Demande 5 plateaux. Contente-toi de suivre la trajectoire avec tes canons sans appuyer sur la détente. Apprends à ton œil à accrocher la cible AVANT que le fusil ne bouge.";
        } else if (fatigue) {
            exercice = "🔋 Endurance : La série rallongée. Charge tes poches avec 30 cartouches au lieu de 25. Tire une série de 30 plateaux pour habituer ton cerveau à rester sous tension au-delà de la limite habituelle des 25.";
        } else if (pct < 70) {
            exercice = "🏗️ Les Fondations : Reviens aux bases. Ne tire que des plateaux simples (fuyants centraux) pendant 2 séries pour reprendre confiance dans ton épaulé et ton swing, sans te soucier du score ni des angles complexes.";
        } else {
            exercice = "🏆 La Pression : Match play. Fais un duel avec un autre tireur de ton niveau sur une série d'entraînement. Le perdant paie le café. Apprends à tirer sous pression pour reproduire la tension de la compétition.";
        }

        texte += `\n📋 ORDONNANCE D'ENTRAÎNEMENT\nExercice prescrit : ${exercice}\n`;
        
        return texte;
    }

    var _chartProg       = null;
    var _chartPoste      = null;

    // Helper pour couleurs graphiques selon mode
    function _getChartColors() {
        const isDark = document.documentElement.classList.contains('dark-mode');
        return {
            grid:        isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            gridStrong:  isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
            text:        isDark ? '#8a96b0' : '#94a3b8',
            textPrimary: isDark ? '#dde2ec' : '#8892a0'
        };
    }
    var _chartRadar      = null;
    var _chartDoubles    = null;
    var _discProgression = 'tous';
    var _discPostes      = 'FU';
    var _discRadar       = 'FU';

    /* =========================================================
       FICHE ÉLÈVE — résumé uniquement
    ========================================================= */
    // NOUVEAU : Fonction pour cliquer sur le badge et changer le niveau
    function changerProfilEleve() {
        if (!db.profils) db.profils = {};
        const profilsDispos = ['Débutant', 'Confirmé', 'Expert'];
        let actuel = db.profils[currentTireur] || 'Confirmé';
        let index = profilsDispos.indexOf(actuel);
        let suivant = profilsDispos[(index + 1) % profilsDispos.length];
        
        db.profils[currentTireur] = suivant;
        saveDB();
        refreshFicheEleve();
        showToast('Passage en profil : ' + suivant, 'success');
    }

    function refreshFicheEleve() {
        // Mise à jour visuelle du badge profil
        if (!db.profils) db.profils = {};
        const profil = db.profils[currentTireur] || 'Confirmé';
        const badge = document.getElementById('badge-profil-eleve');
        if(badge) {
            const profIcons = {
                'Débutant': '<svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:var(--accent);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle;margin-right:2px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',
                'Confirmé': '<svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:var(--accent);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle;margin-right:2px;"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>',
                'Expert': '<svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:var(--accent);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle;margin-right:2px;"><path d="M12 2c.5 2.5-.5 5-2 7-1.5-1-2-3-2-5-2 2-3.5 5-3 8 .5 3 3 5.5 5 6 2-.5 4.5-3 5-6 .5-3-1-6-3-8z"></path></svg>'
            };
            badge.innerHTML = (profIcons[profil] || '') + ' ' + profil;
        }

        // Mise à jour badges calibre & latéralité
        if (!db.eleveInfo) db.eleveInfo = {};
        const info = db.eleveInfo[currentTireur] || { calibre: '12', lateralite: 'droitier', tel: '', email: '', licence: '', club: '' };
        const badgeCal = document.getElementById('eleve-badge-calibre');
        const badgeLat = document.getElementById('eleve-badge-lateralite');
        if (badgeCal) badgeCal.textContent = 'Calibre ' + (info.calibre || '12');
        if (badgeLat) badgeLat.textContent = (info.lateralite === 'gaucher' ? '🤚 Gaucher' : '👉 Droitier');

        // Mise à jour carte Contact
        const hasTel = info.tel && info.tel.trim();
        const hasEmail = info.email && info.email.trim();
        const telDisplay = document.getElementById('eleve-tel-display');
        const emailDisplay = document.getElementById('eleve-email-display');
        const noContact = document.getElementById('eleve-no-contact');
        if (telDisplay) { telDisplay.style.display = hasTel ? 'block' : 'none'; if (hasTel) telDisplay.querySelector('span').textContent = info.tel; }
        if (emailDisplay) { emailDisplay.style.display = hasEmail ? 'block' : 'none'; if (hasEmail) emailDisplay.querySelector('span').textContent = info.email; }
        if (noContact) noContact.style.display = (hasTel || hasEmail) ? 'none' : 'block';

        // Mise à jour carte Qualifications
        const hasLicence = info.licence && info.licence.trim();
        const hasClub = info.club && info.club.trim();
        const licenceDisplay = document.getElementById('eleve-licence-display');
        const clubDisplay = document.getElementById('eleve-club-display');
        const noQualif = document.getElementById('eleve-no-qualif');
        if (licenceDisplay) { licenceDisplay.style.display = hasLicence ? 'block' : 'none'; if (hasLicence) licenceDisplay.querySelector('span').textContent = info.licence; }
        if (clubDisplay) { clubDisplay.style.display = hasClub ? 'block' : 'none'; if (hasClub) clubDisplay.querySelector('span').textContent = info.club; }
        if (noQualif) noQualif.style.display = (hasLicence || hasClub) ? 'none' : 'block';

        // Mise à jour carte Disciplines pratiquées (toggles)
        const discsEleve = getDiscsEleve(currentTireur);
        document.querySelectorAll('#fiche-disciplines .disc-toggle').forEach(b => {
            b.classList.toggle('active', discsEleve.includes(b.dataset.disc));
        });

        const scores = db.eleves[currentTireur] || [];
        ['FU', 'DTL', 'TRAP 1', 'PCH', 'CS'].forEach(d => {
            const list = scores.filter(s => s.disc === d);
            const moy  = list.length
                ? list.reduce((a, b) => a + parseInt(b.score), 0) / list.length : 0;
            const id   = DISC_IDS[d];
            document.getElementById('e-m-' + id).textContent =
                list.length ? (Number.isInteger(moy) ? moy : moy.toFixed(1).replace('.', ',')) : '—';
            document.getElementById('e-c-' + id).textContent =
                list.length + ' SÉRIE' + (list.length > 1 ? 'S' : '');
        });
        // --- 🌟 NOUVEAU : GESTION AFFICHAGE COMPÉTITION ---
        if (!db.activeComps) db.activeComps = {};
        const comp = db.activeComps[currentTireur];
        
        const divSelecteur = document.getElementById('selecteur-mode-comp');
        const divTracker = document.getElementById('tracker-comp');
        
        if (comp) {
            // Une comp est en cours -> On affiche le Tracker
            if (divSelecteur) divSelecteur.style.display = 'none';
            if (divTracker) divTracker.style.display = 'block';
            
            const nbTirees = comp.series ? comp.series.length : 0;
            const total = comp.mode === 100 ? 4 : 8;
            
            const txtTitre = document.getElementById('tracker-comp-texte');
            const txtProg = document.getElementById('tracker-comp-progression');
            if (txtTitre) txtTitre.textContent = comp.disc + ' - ' + comp.mode + ' plateaux';
            if (txtProg) txtProg.textContent = 'Série ' + nbTirees + ' / ' + total + ' terminées';
        } else {
            // Pas de comp -> On affiche le Sélecteur
            if (divSelecteur) divSelecteur.style.display = 'flex';
            if (divTracker) divTracker.style.display = 'none';
            choisirModeComp(0); 
        }

        // --- AFFICHAGE DU PALMARÈS ---
        let htmlArchives = "";
        let archives = (db.archivesComps && db.archivesComps[currentTireur]) ? db.archivesComps[currentTireur] : [];

        // 🧹 NOUVEAU : Nettoyage automatique des tiroirs vides (Anti-Bug)
        const toutesLesSeriesEleve = db.eleves[currentTireur] || [];
        const archivesValides = archives.filter(c => {
            const seriesExistantes = c.series.map(id => toutesLesSeriesEleve.find(s => s.id === id)).filter(Boolean);
            return seriesExistantes.length > 0; // Garde l'archive s'il reste au moins 1 série
        });

        if (archivesValides.length !== archives.length) {
            db.archivesComps[currentTireur] = archivesValides;
            saveDB();
            archives = archivesValides;
        }

        if (archives.length > 0) {
            htmlArchives = `<div class="stats-titre" style="margin-top:15px;">Palmarès Compétitions</div>`;
            archives.forEach((c, index) => {
                htmlArchives += `
                    <div class="card" style="padding:12px 16px; margin-bottom:10px; border-left:5px solid var(--accent);">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <div style="font-size:0.9rem; font-weight:900;">${c.disc} - ${c.mode} PLX</div>
                                <div class="sub">${c.dateFin || 'Terminé'}</div>
                            </div>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <button class="btn-secondary" style="width:auto; padding:0 12px; height:35px; font-size:0.7rem;" 
                                    onclick="event.stopPropagation(); genererSuperPDF('${currentTireur}', db.archivesComps['${currentTireur}'][${index}])">
                                    <svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle;margin-right:3px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> PDF
                                </button>
                                <button class="btn-del" style="font-size:1.3rem; padding:4px;" 
                                    onclick="event.stopPropagation(); supprimerArchive('${currentTireur}', ${index})">
                                    <svg class="icon-sm" viewBox="0 0 24 24" style="margin:0;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </div>
                        </div>
                    </div>`;
            });
        }
        
        const zoneArchives = document.getElementById('zone-archives-comps');
        if (zoneArchives) zoneArchives.innerHTML = htmlArchives;
    }

    function ouvrirStatsEleve() {
        afficherStatsEleve(currentTireur);
    }



    /* =========================================================
       GRAPHIQUE RADAR - NOUVELLE FONCTIONNALITÉ
    ========================================================= */
    function calculerDonneesRadar(disc, scoresFilter) {
        const allScores = db.eleves[currentTireur] || [];
        const scores = scoresFilter || allScores;
        const scoresDisc = scores.filter(s => s.disc === disc);
        const avecGrille = scoresDisc.filter(s => s.grille && s.grille.length === 25);

        if (!scoresDisc.length) {
            return { debut: 0, milieu: 0, fin: 0, regularite: 0, progression: 0, pointsForts: 0 };
        }

        const estPCHCS = DISC_DOUBLES.includes(disc);

        if (estPCHCS) {
            // ── PCH/CS : axes Simples / Doublés / 2e tir ──
            var simplesHits = 0, simplesTotal = 0;
            var doubles1Hits = 0, doubles1Total = 0;
            var doubles2Hits = 0, doubles2Total = 0;

            avecGrille.forEach(function(s) {
                var map = grilleToMenuMap(s.menuPCH);
                if (map) {
                    for (var i = 0; i < 25; i++) {
                        var item = map[i];
                        if (!item) continue;
                        var hit = s.grille[i] > 0 ? 1 : 0;
                        if (item.type === 'simple') {
                            simplesHits += hit; simplesTotal++;
                        } else if (item.type === 'double') {
                            var isFirst = (i === 0 || map[i - 1] !== item);
                            if (isFirst) { doubles1Hits += hit; doubles1Total++; }
                            else { doubles2Hits += hit; doubles2Total++; }
                        }
                    }
                } else {
                    // Fallback : sans menuPCH, on compte tout comme simples
                    for (var j = 0; j < 25; j++) {
                        simplesTotal++;
                        if (s.grille[j] > 0) simplesHits++;
                    }
                }
            });

            var pctSimples = simplesTotal ? Math.round((simplesHits / simplesTotal) * 100) : 0;
            var pctDoubles1 = doubles1Total ? Math.round((doubles1Hits / doubles1Total) * 100) : 0;
            var pctDoubles2 = doubles2Total ? Math.round((doubles2Hits / doubles2Total) * 100) : 0;

            // Régularité & Progression (communes)
            var allPct = scoresDisc.map(function(s) { return Math.round(parseInt(s.score) / maxParSerie(disc) * 100); });
            var avg = allPct.reduce(function(a, b) { return a + b; }, 0) / allPct.length;
            var ecartType = Math.sqrt(allPct.reduce(function(a, b) { return a + Math.pow(b - avg, 2); }, 0) / allPct.length);
            var regularite = Math.max(0, Math.min(100, Math.round(100 - ecartType * 2)));

            var progression = 0;
            if (scoresDisc.length === 1) {
                progression = Math.round(parseInt(scoresDisc[0].score) / maxParSerie(disc) * 100);
            } else if (scoresDisc.length >= 2) {
                var poidsTotal = 0, sommePonderee = 0;
                scoresDisc.forEach(function(s, i) {
                    var poids = i + 1;
                    var pct = parseInt(s.score) / maxParSerie(disc) * 100;
                    sommePonderee += pct * poids;
                    poidsTotal += poids;
                });
                var moyPonderee = sommePonderee / poidsTotal;
                var pctRecente = parseInt(scoresDisc[0].score) / maxParSerie(disc) * 100;
                var pctAncienne = parseInt(scoresDisc[scoresDisc.length - 1].score) / maxParSerie(disc) * 100;
                var tendance = pctRecente - pctAncienne;
                progression = Math.max(0, Math.min(100, Math.round(moyPonderee + tendance * 0.15)));
            }

            // Points forts PCH/CS : taux de réussite moyen par poste ≥ 60%
            var pointsForts = 0;
            if (avecGrille.length) {
                var pfPostesSet = new Set();
                avecGrille.forEach(function(s) {
                    var map = grilleToMenuMap(s.menuPCH);
                    if (map) {
                        for (var i = 0; i < 25; i++) {
                            if (map[i] && map[i].poste) pfPostesSet.add(map[i].poste);
                        }
                    }
                });
                var pfNbPostes = pfPostesSet.size > 0 ? pfPostesSet.size : 5;
                var pfPosteList = Array.from(pfPostesSet).sort(function(a,b){return a-b;});
                if (pfPosteList.length === 0) pfPosteList = [1,2,3,4,5];

                var postesHits = new Array(pfNbPostes).fill(0);
                var postesTotal = new Array(pfNbPostes).fill(0);
                avecGrille.forEach(function(s) {
                    var map = grilleToMenuMap(s.menuPCH);
                    if (map) {
                        for (var i = 0; i < 25; i++) {
                            var item = map[i];
                            if (!item) continue;
                            var pIdx = pfPosteList.indexOf(item.poste);
                            if (pIdx >= 0 && pIdx < pfNbPostes) {
                                postesTotal[pIdx]++;
                                if (s.grille[i] > 0) postesHits[pIdx]++;
                            }
                        }
                    } else {
                        // Fallback sans menuPCH : groupes de 5
                        for (var g2 = 0; g2 < 5; g2++) {
                            for (var k = g2 * 5; k < g2 * 5 + 5; k++) {
                                if (g2 < pfNbPostes) {
                                    postesTotal[g2]++;
                                    if (s.grille[k] > 0) postesHits[g2]++;
                                }
                            }
                        }
                    }
                });
                var fortsCount = postesHits.filter(function(h, i) { return postesTotal[i] > 0 && (h / postesTotal[i]) >= 0.6; }).length;
                pointsForts = Math.round((fortsCount / pfNbPostes) * 100);
            }

            return {
                debut: pctSimples,   // Axe 1 : Simples
                milieu: pctDoubles1, // Axe 2 : Doublés (1er tir)
                fin: pctDoubles2,    // Axe 3 : 2e tir doublés
                regularite: regularite,
                progression: progression,
                pointsForts: pointsForts
            };

        } else {
            // ── FU/DTL/TRAP1 : axes Début / Milieu / Fin ──
            let debutHits = 0, debutTotal = 0;
            let milieuHits = 0, milieuTotal = 0;
            let finHits = 0, finTotal = 0;

            avecGrille.forEach(s => {
                for (let i = 0; i < 8; i++) { debutTotal++; if (s.grille[i] > 0) debutHits++; }
                for (let i = 8; i < 17; i++) { milieuTotal++; if (s.grille[i] > 0) milieuHits++; }
                for (let i = 17; i < 25; i++) { finTotal++; if (s.grille[i] > 0) finHits++; }
            });

            const debut = debutTotal ? Math.round((debutHits / debutTotal) * 100) : 0;
            const milieu = milieuTotal ? Math.round((milieuHits / milieuTotal) * 100) : 0;
            const fin = finTotal ? Math.round((finHits / finTotal) * 100) : 0;

            const allPct = scoresDisc.map(s => Math.round(parseInt(s.score) / maxParSerie(disc) * 100));
            const avg = allPct.reduce((a, b) => a + b, 0) / allPct.length;
            const ecartType = Math.sqrt(allPct.reduce((a, b) => a + (b - avg) ** 2, 0) / allPct.length);
            const regularite = Math.max(0, Math.min(100, Math.round(100 - ecartType * 2)));

            let progression = 0;
            if (scoresDisc.length === 1) {
                progression = Math.round(parseInt(scoresDisc[0].score) / maxParSerie(disc) * 100);
            } else if (scoresDisc.length >= 2) {
                let poidsTotal = 0, sommePonderee = 0;
                scoresDisc.forEach(function(s, i) {
                    var poids = i + 1;
                    var pct = parseInt(s.score) / maxParSerie(disc) * 100;
                    sommePonderee += pct * poids;
                    poidsTotal += poids;
                });
                var moyPonderee = sommePonderee / poidsTotal;
                var pctRecente = parseInt(scoresDisc[0].score) / maxParSerie(disc) * 100;
                var pctAncienne = parseInt(scoresDisc[scoresDisc.length - 1].score) / maxParSerie(disc) * 100;
                var tendance = pctRecente - pctAncienne;
                progression = Math.max(0, Math.min(100, Math.round(moyPonderee + tendance * 0.15)));
            }

            let pointsForts = 0;
            if (avecGrille.length) {
                // Même logique que PCH/CS : taux de réussite moyen par poste
                // Un poste est "fort" si son taux de réussite moyen ≥ 60%
                const postesHits = [0, 0, 0, 0, 0];
                const postesTotal = [0, 0, 0, 0, 0];
                avecGrille.forEach(s => {
                    for (let g = 0; g < 5; g++) {
                        for (let i = g * 5; i < g * 5 + 5; i++) {
                            postesTotal[g]++;
                            if (s.grille[i] > 0) postesHits[g]++;
                        }
                    }
                });
                const fortsCount = postesHits.filter((h, i) => postesTotal[i] > 0 && (h / postesTotal[i]) >= 0.6).length;
                pointsForts = Math.round((fortsCount / 5) * 100);
            }

            return { debut, milieu, fin, regularite, progression, pointsForts };
        }
    }

    function _dessinerRadar(disc, scoresFilter) {
        const data = calculerDonneesRadar(disc, scoresFilter);
        const ctx = document.getElementById('chart-radar').getContext('2d');

        if (_chartRadar) _chartRadar.destroy();

        // Labels adaptés selon la discipline
        var estPCHCSRadar = DISC_DOUBLES.includes(disc);
        var labels;
        if (estPCHCSRadar) {
            labels = ['Simples', 'Doublés', '2e tir', 'Régularité', 'Progression', 'Points forts'];
        } else {
            labels = ['Début', 'Milieu', 'Fin', 'Régularité', 'Progression', 'Points forts'];
        }
        const values = [data.debut, data.milieu, data.fin, data.regularite, data.progression, data.pointsForts];

        const scoreGlobal = Math.round(values.reduce((a, b) => a + b, 0) / values.length);

        let accentColor = '#f39c12';
        let scoreClass = '';
        if (scoreGlobal >= 75) { accentColor = '#72d582'; scoreClass = 'excellent'; }
        else if (scoreGlobal >= 50) { accentColor = '#edcc52'; scoreClass = 'good'; }
        else { accentColor = '#e66756'; scoreClass = 'weak'; }

        const rootStyles = getComputedStyle(document.documentElement);
        const customAccent = rootStyles.getPropertyValue('--accent').trim();
        if (customAccent && scoreGlobal >= 50 && scoreGlobal < 75) {
            accentColor = customAccent;
        }

        // En mode multi-séries (semaine/mensuel), afficher 2 datasets :
        // 1) Profil de la série la plus récente (opaque, principal)
        // 2) Profil moyen de la période (semi-transparent, fond)
        var datasets = [];
        var isMultiSerie = scoresFilter && scoresFilter.length > 1;

        if (isMultiSerie) {
            // Dataset 1 : moyenne de la période (en fond, semi-transparent)
            var dataMoyenne = calculerDonneesRadar(disc, scoresFilter);
            var valuesMoyenne = [dataMoyenne.debut, dataMoyenne.milieu, dataMoyenne.fin, dataMoyenne.regularite, dataMoyenne.progression, dataMoyenne.pointsForts];
            datasets.push({
                label: 'Moyenne période',
                data: valuesMoyenne,
                backgroundColor: 'rgba(150,150,150,0.15)',
                borderColor: 'rgba(150,150,150,0.5)',
                borderWidth: 1.5,
                borderDash: [4, 4],
                pointBackgroundColor: 'rgba(150,150,150,0.6)',
                pointBorderColor: '#fff',
                pointBorderWidth: 1,
                pointRadius: 3,
                pointHoverRadius: 5
            });

            // Dataset 2 : série la plus récente (opaque, principal)
            var dataRecente = calculerDonneesRadar(disc, [scoresFilter[0]]);
            var valuesRecente = [dataRecente.debut, dataRecente.milieu, dataRecente.fin, dataRecente.regularite, dataRecente.progression, dataRecente.pointsForts];
            datasets.push({
                label: 'Dernière série',
                data: valuesRecente,
                backgroundColor: accentColor + '40',
                borderColor: accentColor,
                borderWidth: 2.5,
                pointBackgroundColor: accentColor,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            });

            // Recalculer le score global sur la série récente pour le badge
            var scoreRecent = Math.round(valuesRecente.reduce((a, b) => a + b, 0) / valuesRecente.length);
            if (scoreRecent >= 75) { accentColor = '#72d582'; scoreClass = 'excellent'; }
            else if (scoreRecent >= 50) { accentColor = '#edcc52'; scoreClass = 'good'; }
            else { accentColor = '#e66756'; scoreClass = 'weak'; }
            datasets[1].backgroundColor = accentColor + '40';
            datasets[1].borderColor = accentColor;
            datasets[1].pointBackgroundColor = accentColor;
        } else {
            // Mode série unique — un seul dataset
            datasets.push({
                label: 'Performance',
                data: values,
                backgroundColor: accentColor + '40',
                borderColor: accentColor,
                borderWidth: 2.5,
                pointBackgroundColor: accentColor,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            });
        }

        _chartRadar = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: isMultiSerie,
                        position: 'bottom',
                        labels: {
                            font: { size: 10 },
                            color: _getChartColors().text,
                            boxWidth: 12,
                            padding: 10,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ctx.dataset.label + ': ' + ctx.label + ' ' + ctx.raw + '%'
                        }
                    }
                },
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        beginAtZero: true,
                        ticks: {
                            stepSize: 25,
                            font: { size: 9 },
                            color: _getChartColors().text,
                            backdropColor: 'transparent'
                        },
                        pointLabels: {
                            font: { size: 11, weight: '700' },
                            color: _getChartColors().textPrimary
                        },
                        grid: { color: _getChartColors().grid },
                        angleLines: { color: _getChartColors().grid }
                    }
                }
            }
        });

        const legendContainer = document.getElementById('radar-legend');
        legendContainer.innerHTML = '';

        // Légende custom : toujours les valeurs de la série principale (récente ou unique)
        var mainValues = isMultiSerie ? valuesRecente : values;

        labels.forEach((label, i) => {
            const item = document.createElement('div');
            item.className = 'radar-legend-item';

            const dot = document.createElement('div');
            dot.className = 'radar-legend-dot';
            dot.style.background = mainValues[i] >= 75 ? '#72d582' : mainValues[i] >= 50 ? '#edcc52' : '#e66756';

            const text = document.createElement('span');
            text.textContent = `${label}: ${mainValues[i]}%`;

            item.append(dot, text);
            legendContainer.appendChild(item);
        });

        // Titre avec badge score — sur la série principale
        var badgeScore = isMultiSerie
            ? Math.round(mainValues.reduce((a, b) => a + b, 0) / mainValues.length)
            : scoreGlobal;
        var badgeClass = badgeScore >= 75 ? 'excellent' : badgeScore >= 50 ? 'good' : 'weak';

        const titreRadar = document.querySelector('#section-radar .stats-titre');
        if (titreRadar) {
            titreRadar.innerHTML = `Profil de performance <span class="radar-score-badge ${badgeClass}">${badgeScore}%</span>`;
        }
    }

    /* =========================================================
       CHARGE ET AFFICHE LES STATS AVANCÉES D'UN ÉLÈVE
    ========================================================= */
    var _statsMode = 'derniere'; // 'derniere', 'seance' ou 'mois'

    function setStatsMode(mode) {
        _statsMode = mode;
        // Si on change de mode manuellement, sortir du mode ciblé
        if (window._statsSerieCiblee) {
            window._statsSerieCiblee = null;
            // Restaurer l'affichage normal
            var retourBtn = document.getElementById('stats-retour-btn');
            if (retourBtn) retourBtn.style.display = 'none';
            var modeBar = document.querySelector('.stats-mode-bar');
            if (modeBar) modeBar.style.display = 'flex';
            document.getElementById('stats-eleve-nom').textContent = currentTireur;
        }
        document.getElementById('btn-stats-derniere').classList.toggle('active', mode === 'derniere');
        document.getElementById('btn-stats-seance').classList.toggle('active', mode === 'seance');
        document.getElementById('btn-stats-mois').classList.toggle('active', mode === 'mois');
        // Re-rendre les graphiques avec le nouveau mode
        _rafraichirStats();
    }

    function _rafraichirStats() {
        if (!currentTireur) return;
        var disc = (_eleveActif && _eleveActif.disc) ? _eleveActif.disc : currentDisc;
        var allScores = db.eleves[currentTireur] || [];
        // Filtrer par discipline du sélecteur
        var scoresDisc = disc ? allScores.filter(function(s) { return s.disc === disc; }) : allScores;
        var scores;

        // Si une série ciblée est définie (depuis l'historique), l'afficher
        if (window._statsSerieCiblee) {
            scores = [window._statsSerieCiblee];
            // On NE consomme PAS — reste active tant que l'utilisateur n'a pas cliqué "Retour"
        } else if (_statsMode === 'derniere') {
            // Dernière série dans la discipline (unshift = plus récent en index 0)
            scores = scoresDisc.length > 0 ? [scoresDisc[0]] : [];
        } else if (_statsMode === 'seance') {
            // Dernière séance = toutes les séries du même jour que la dernière série
            if (scoresDisc.length > 0) {
                var derniereDate = scoresDisc[0].date;
                scores = scoresDisc.filter(function(s) { return s.date === derniereDate; });
            } else {
                scores = [];
            }
        } else {
            // mode 'mois' → 30 derniers jours glissants
            var ilY30jours = new Date();
            ilY30jours.setDate(ilY30jours.getDate() - 30);
            ilY30jours.setHours(0, 0, 0, 0);
            scores = scoresDisc.filter(function(s) {
                var d = _parseHistoDate(s.date);
                return d && d >= ilY30jours;
            });
        }

        // --- Affichage Records / Dernière série ---
        var sectionDerniere = document.getElementById('section-derniere-score');
        var sectionRecords  = document.getElementById('section-records');

        if (_statsMode === 'derniere') {
            // Tuile unique centrée avec le score de la dernière série
            sectionRecords.style.display = 'none';
            if (scores.length > 0) {
                var s = scores[0];
                var max = maxParSerie(s.disc);
                var pct = Math.round((parseInt(s.score) / max) * 100);
                document.getElementById('derniere-score-val').textContent = s.score + '/' + max;
                document.getElementById('derniere-score-pct').textContent = pct + '%';
                document.getElementById('derniere-score-date').textContent = s.date || '';
                sectionDerniere.style.display = 'block';
            } else {
                sectionDerniere.style.display = 'none';
            }
        } else {
            // 3 tuiles records (mode Séance ou Mois)
            sectionDerniere.style.display = 'none';
            if (scores.length > 0) {
                var allS = scores.map(function(s) { return parseInt(s.score); });
                var bestRaw = Math.max.apply(null, allS);
                var bestSerie = scores.find(function(s) { return parseInt(s.score) === bestRaw; });
                var bestMax = bestSerie ? maxParSerie(bestSerie.disc) : 25;
                var globalAvg = allS.reduce(function(a, b) { return a + b; }, 0) / allS.length;
                document.getElementById('rec-best').textContent = bestRaw + '/' + bestMax;
                document.getElementById('rec-avg').textContent = globalAvg.toFixed(1).replace('.', ',');
                document.getElementById('rec-total').textContent = scores.length;
                sectionRecords.style.display = 'block';
            } else {
                sectionRecords.style.display = 'none';
            }
        }

        // Radar
        if (scores.length > 0) {
            document.getElementById('section-radar').style.display = 'block';
            _dessinerRadar(disc || 'FU', scores);
        } else {
            document.getElementById('section-radar').style.display = 'none';
        }

        // Progression — minimum 3 séries pour un graphique significatif
        if (scores.length >= 3) {
            document.getElementById('section-progression').style.display = 'block';
            _dessinerProgression(disc || 'tous', scores);
        } else {
            document.getElementById('section-progression').style.display = 'none';
        }

        // Postes
        var avecGrille = scores.filter(function(s) { return s.grille && s.grille.length === 25; });
        var estPCHCSLocal = DISC_DOUBLES.includes(disc);
        if (avecGrille.length) {
            document.getElementById('section-postes').style.display = 'block';
            document.getElementById('stats-empty').style.display = 'none';
            // Adapter le titre selon la discipline
            var titrePostes = document.querySelector('#section-postes .stats-titre');
            if (titrePostes) {
                titrePostes.textContent = estPCHCSLocal ? 'Réussite par poste' : 'Réussite par postes';
            }
            _dessinerPostes(disc || 'FU', scores);

            // Doublés — uniquement PCH/CS
            if (estPCHCSLocal) {
                document.getElementById('section-doubles').style.display = 'block';
                _dessinerDoubles(disc || 'PCH', scores);
            } else {
                document.getElementById('section-doubles').style.display = 'none';
            }
        } else {
            document.getElementById('section-postes').style.display = 'none';
            document.getElementById('section-doubles').style.display = 'none';
            if (scores.length === 0) {
                document.getElementById('stats-empty').style.display = 'block';
            } else {
                document.getElementById('stats-empty').style.display = 'none';
            }
        }

        // Escalier — uniquement en mode série individuelle (dernière ou ciblée)
        var afficherEscalierSection = (window._statsSerieCiblee || _statsMode === 'derniere') && scores.length === 1 && scores[0].grille && scores[0].grille.length === 25;
        if (afficherEscalierSection) {
            afficherEscalier(scores[0]);
        } else {
            var escSection = document.getElementById('section-escalier');
            if (escSection) escSection.style.display = 'none';
        }
    }

    function openStats(el) {
        switchTab('page-stats', el);
    }

    /* =========================================================
       CYCLE THÈME RAPIDE (Clair → Sombre → Plein Soleil)
    ========================================================= */
    function cycleTheme() {
        var isDark = document.documentElement.classList.contains('dark-mode');
        var isHighVis = document.documentElement.classList.contains('high-vis');

        if (!isDark && !isHighVis) {
            // Clair → Sombre
            setDarkMode(true);
            document.documentElement.classList.remove('high-vis');
            localStorage.setItem('theme_soleil', 'non');
            if (document.getElementById('checkbox-soleil')) document.getElementById('checkbox-soleil').checked = false;
            if (document.getElementById('checkbox-dark')) document.getElementById('checkbox-dark').checked = true;
        } else if (isDark && !isHighVis) {
            // Sombre → Plein Soleil
            setDarkMode(false);
            document.documentElement.classList.add('high-vis');
            localStorage.setItem('theme_soleil', 'oui');
            if (document.getElementById('checkbox-soleil')) document.getElementById('checkbox-soleil').checked = true;
            if (document.getElementById('checkbox-dark')) document.getElementById('checkbox-dark').checked = false;
        } else {
            // Plein Soleil → Clair
            document.documentElement.classList.remove('high-vis');
            localStorage.setItem('theme_soleil', 'non');
            if (document.getElementById('checkbox-soleil')) document.getElementById('checkbox-soleil').checked = false;
            if (document.getElementById('checkbox-dark')) document.getElementById('checkbox-dark').checked = false;
        }
        updateThemeIcon();
        updateThemeColorMeta();
        sauvegarderParams();
    }

    function updateThemeIcon() {
        var isDark = document.documentElement.classList.contains('dark-mode');
        var isHighVis = document.documentElement.classList.contains('high-vis');
        var iconSun = document.getElementById('icon-theme-sun');
        var iconMoon = document.getElementById('icon-theme-moon');
        var iconSunBold = document.getElementById('icon-theme-sun-bold');
        if (!iconSun) return;
        iconSun.style.display = (!isDark && !isHighVis) ? 'block' : 'none';
        iconMoon.style.display = (isDark && !isHighVis) ? 'block' : 'none';
        iconSunBold.style.display = isHighVis ? 'block' : 'none';
    }

    /* =========================================================
       PAGE ANALYSE COACH
    ========================================================= */
    var _analyseMode = 'serie'; // 'serie', 'semaine', 'mois'

    function openAnalyse(el) {
        switchTab('page-analyse', el);
    }



    function setAnalyseMode(mode) {
        _analyseMode = mode;
        document.getElementById('btn-analyse-serie').classList.toggle('active', mode === 'serie');
        document.getElementById('btn-analyse-semaine').classList.toggle('active', mode === 'semaine');
        document.getElementById('btn-analyse-mois').classList.toggle('active', mode === 'mois');
        // Mettre à jour le label du bouton PDF contextuel
        var pdfLabel = document.getElementById('btn-pdf-analyse-label');
        if (pdfLabel) {
            var labels = { serie: 'Export PDF — Série', semaine: 'Export PDF — Semaine', mois: 'Export PDF — Mensuel' };
            pdfLabel.textContent = labels[mode] || 'Export PDF';
        }
        _rafraichirAnalyse();
    }

    function _getScoresAnalyse() {
        var nom = currentTireur;
        if (!nom) return [];
        var allScores = db.eleves[nom] || [];
        var disc = (_eleveActif && _eleveActif.disc) ? _eleveActif.disc : currentDisc;
        var scoresDisc = disc ? allScores.filter(function(s) { return s.disc === disc; }) : allScores;

        if (_analyseMode === 'serie') {
            return scoresDisc.length > 0 ? [scoresDisc[0]] : [];
        } else if (_analyseMode === 'semaine') {
            var ilY7jours = new Date();
            ilY7jours.setDate(ilY7jours.getDate() - 7);
            ilY7jours.setHours(0, 0, 0, 0);
            return scoresDisc.filter(function(s) {
                var d = _parseHistoDate(s.date);
                return d && d >= ilY7jours;
            });
        } else {
            var ilY30jours = new Date();
            ilY30jours.setDate(ilY30jours.getDate() - 30);
            ilY30jours.setHours(0, 0, 0, 0);
            return scoresDisc.filter(function(s) {
                var d = _parseHistoDate(s.date);
                return d && d >= ilY30jours;
            });
        }
    }

    // Séries de la période PRÉCÉDENTE pour comparaison
    function _getScoresPeriodePrecedente(nom, disc, mode) {
        var allScores = db.eleves[nom] || [];
        var scoresDisc = disc ? allScores.filter(function(s) { return s.disc === disc; }) : allScores;
        var nbJours = mode === 'semaine' ? 7 : 30;

        var finPeriode = new Date();
        finPeriode.setDate(finPeriode.getDate() - nbJours);
        finPeriode.setHours(0, 0, 0, 0);

        var debutPeriode = new Date(finPeriode);
        debutPeriode.setDate(debutPeriode.getDate() - nbJours);

        return scoresDisc.filter(function(s) {
            var d = _parseHistoDate(s.date);
            return d && d >= debutPeriode && d < finPeriode;
        });
    }

    function _analyseStrategique(nom, scores, mode, disc) {
        // ── Seuils minimaux ──
        var seuil = mode === 'semaine' ? 3 : 5;
        if (scores.length < seuil) {
            return _pickPhrase('strato_seuil_insuffisant', disc);
        }

        var max = maxParSerie(disc);

        // ── 1. BILAN DE LA PÉRIODE ──
        var allPct = scores.map(function(s) { return Math.round(parseInt(s.score) / max * 100); });
        var avgPct = Math.round(allPct.reduce(function(a, b) { return a + b; }, 0) / allPct.length);
        var bestPct = Math.max.apply(null, allPct);
        var worstPct = Math.min.apply(null, allPct);
        var nbSeries = scores.length;
        var tousParfaits = allPct.every(function(p) { return p === 100; });

        var lignes = [];
        lignes.push('📊 BILAN DE LA PÉRIODE');
        lignes.push('• ' + nbSeries + ' séries en ' + disc + ' — Moyenne : ' + avgPct + '% (meilleure : ' + bestPct + '%, moins bonne : ' + worstPct + '%)');

        if (tousParfaits) {
            lignes.push('• 100% global — ' + _pickPhrase('strato_parfait_periode', disc));
        }

        // ── 2. POINTS FORTS / POINTS FAIBLES RÉCURRENTS ──
        lignes.push('');
        lignes.push('🎯 POINTS FORTS / POINTS FAIBLES RÉCURRENTS');

        // Zone analysis (groupes de 5)
        var avecGrille = scores.filter(function(s) { return s.grille && s.grille.length === 25; });
        var groupes = ['1-5', '6-10', '11-15', '16-20', '21-25'];
        var zoneForte = '', zoneFaible = '', tauxFort = 0, tauxFaible = 100;

        if (avecGrille.length >= 1) {
            var tauxZones = groupes.map(function(_, gi) {
                var hits = 0, total = 0;
                avecGrille.forEach(function(s) {
                    for (var i = gi * 5; i < gi * 5 + 5; i++) {
                        total++;
                        if (s.grille[i] > 0) hits++;
                    }
                });
                return total ? Math.round((hits / total) * 100) : 0;
            });
            var maxI = tauxZones.indexOf(Math.max.apply(null, tauxZones));
            var minI = tauxZones.indexOf(Math.min.apply(null, tauxZones));
            zoneForte = groupes[maxI];
            tauxFort = tauxZones[maxI];
            zoneFaible = groupes[minI];
            tauxFaible = tauxZones[minI];
        }

        if (zoneForte) {
            lignes.push('• Zone forte : tirs ' + zoneForte + ' (' + tauxFort + '%)');
        }
        if (zoneFaible && tauxFaible < 80) {
            lignes.push('• Zone faible récurrente : tirs ' + zoneFaible + ' (' + tauxFaible + '%) → ' + _pickPhrase('strato_zone_recurente', disc).replace(/\{zone\}/g, zoneFaible));
        }

        // Direction analysis — aggregate all missed shots
        var dirMissCounts = { 'G': 0, 'dG': 0, 'C': 0, 'dD': 0, 'D': 0 };
        var totalMissedDir = 0;
        scores.forEach(function(s) {
            if (s.directions && s.directions.length === 25 && s.grille && s.grille.length === 25) {
                s.grille.forEach(function(val, i) {
                    if (val === 0 && s.directions[i]) {
                        var d = s.directions[i];
                        if (dirMissCounts.hasOwnProperty(d)) {
                            dirMissCounts[d]++;
                            totalMissedDir++;
                        }
                    }
                });
            }
        });

        if (totalMissedDir >= 3) {
            // Regrouper Gauche / Centre / Droite
            var groupeGauche = dirMissCounts['G'] + dirMissCounts['dG'];
            var groupeCentre = dirMissCounts['C'];
            var groupeDroite = dirMissCounts['D'] + dirMissCounts['dD'];
            var dominant, dominantPct;
            if (groupeGauche >= groupeDroite && groupeGauche >= groupeCentre) {
                dominant = 'gauche';
                dominantPct = totalMissedDir ? Math.round((groupeGauche / totalMissedDir) * 100) : 0;
            } else if (groupeDroite >= groupeGauche && groupeDroite >= groupeCentre) {
                dominant = 'droite';
                dominantPct = totalMissedDir ? Math.round((groupeDroite / totalMissedDir) * 100) : 0;
            } else {
                dominant = 'centre (fuyants)';
                dominantPct = totalMissedDir ? Math.round((groupeCentre / totalMissedDir) * 100) : 0;
            }
            if (dominantPct >= 40) {
                lignes.push('• Directions : ' + dominantPct + '% des ratés partent à ' + dominant);
            }
        }

        // 2ème coup analysis
        var nbDeuxiemeCoup = 0, nbTotalHits = 0;
        avecGrille.forEach(function(s) {
            s.grille.forEach(function(val) {
                if (val > 0) nbTotalHits++;
                if (val === 2) nbDeuxiemeCoup++;
            });
        });
        if (nbTotalHits > 0 && nbDeuxiemeCoup > 0) {
            var ratioDeuxieme = Math.round((nbDeuxiemeCoup / nbTotalHits) * 100);
            if (ratioDeuxieme >= 30) {
                lignes.push('• 2ème coup : ' + ratioDeuxieme + '% de tes touches sont au rattrapage → ' + _pickPhrase('strato_deuxieme_coup', disc));
            }
        }

        // PCH / CS specific phrases
        if (disc === 'PCH') {
            var phrasesPCH = _pickPhrasesFrom([
                'pch_traversards', 'pch_rentrants', 'pch_fuyants', 'pch_surplombs',
                'pch_battements', 'pch_lapins', 'pch_distance', 'pch_enchainement',
                'pch_doubler', 'pch_terrain'
            ], 'PCH', 1);
            if (phrasesPCH.length) lignes.push('• ' + phrasesPCH[0]);
        }
        if (disc === 'CS') {
            var phrasesCS = _pickPhrasesFrom([
                'cs_poste', 'cs_adaptation', 'cs_meteo', 'cs_memoire'
            ], 'CS', 1);
            if (phrasesCS.length) lignes.push('• ' + phrasesCS[0]);
        }

        // ── 3. TENDANCE vs PÉRIODE PRÉCÉDENTE ──
        lignes.push('');
        lignes.push('📈 TENDANCE vs PÉRIODE PRÉCÉDENTE');

        var prevScores = _getScoresPeriodePrecedente(nom, disc, mode);
        if (prevScores.length >= 2) {
            var prevAllPct = prevScores.map(function(s) { return Math.round(parseInt(s.score) / maxParSerie(s.disc) * 100); });
            var prevAvg = Math.round(prevAllPct.reduce(function(a, b) { return a + b; }, 0) / prevAllPct.length);
            var delta = avgPct - prevAvg;
            var deltaStr = (delta >= 0 ? '+' : '') + delta;
            lignes.push('• Période précédente : ' + prevAvg + '% → Période actuelle : ' + avgPct + '% (' + deltaStr + '%)');

            if (delta > 4) {
                lignes.push('• ' + _pickPhrase('strato_progression', disc));
            } else if (delta < -4) {
                lignes.push('• ' + _pickPhrase('strato_regression', disc));
            } else {
                lignes.push('• ' + _pickPhrase('strato_stagnation', disc));
            }
        } else {
            lignes.push('• Pas de données sur la période précédente pour comparaison. Ces résultats serviront de base de référence.');
        }

        // ── 4. VERDICT COACH ──
        lignes.push('');
        lignes.push('📋 VERDICT COACH');

        // Synthèse textuelle
        var verdict = '';
        if (tousParfaits) {
            verdict = 'Des séries parfaites sur cette période. Ta maîtrise est totale. Le défi maintenant : confirmer ça en compétition, sous la pression du classement.';
        } else if (avgPct >= 80) {
            verdict = 'Ton niveau est solide sur cette période';
            if (zoneFaible && tauxFaible < 70) {
                verdict += ', mais les tirs ' + zoneFaible + ' te coûtent des points. Travaille cette zone en spécifique';
            }
            verdict += '.';
        } else if (avgPct >= 60) {
            verdict = 'Des résultats corrects dans l\'ensemble';
            if (zoneFaible && tauxFaible < 60) {
                verdict += ', avec un point faible clair sur les tirs ' + zoneFaible + '. Isole cette zone en entraînement';
            }
            if (nbDeuxiemeCoup > 0 && nbTotalHits > 0 && Math.round((nbDeuxiemeCoup / nbTotalHits) * 100) >= 25) {
                verdict += '. Ton score dépend trop du rattrapage — ton 1er coup manque de tranchant';
            }
            verdict += '.';
        } else {
            verdict = 'La période est difficile. Pas de panique, mais il faut réagir';
            verdict += '. Reviens aux fondamentaux : position, épauler, poser ton regard, appeler ton plateau.';
        }
        lignes.push('• ' + verdict);

        // Ordonnance
        var ordPhrase = '';
        // Si direction dominante, proposer un blocage directionnel en priorité
        if (totalMissedDir >= 4 && (disc === 'FU' || disc === 'DTL' || disc === 'TRAP 1')) {
            var gG = dirMissCounts['G'] + dirMissCounts['dG'];
            var gD = dirMissCounts['D'] + dirMissCounts['dD'];
            if (gD > gG && gD > groupeCentre) {
                ordPhrase = "📍 Blocage à Droite : Place-toi au poste 3, oriente tes pieds de 30 degrés vers la droite (pour pré-charger ton amplitude du côté bloqué). Tire 10 plateaux d'affilée dans cette posture pour mémoriser le mouvement.";
            } else if (gG > gD && gG > groupeCentre) {
                ordPhrase = "📍 Blocage à Gauche : Place-toi au poste 3, oriente tes pieds de 30 degrés vers la gauche (pour pré-charger ton amplitude du côté bloqué). Tire 10 plateaux d'affilée dans cette posture pour mémoriser le mouvement.";
            }
        }

        if (!ordPhrase) {
            var ordCategorie = null;
            if (disc === 'PCH') {
                var ordPCH = ['ord_pch_lecteur', 'ord_pch_lapinier', 'ord_pch_bande', 'ord_pch_double', 'ord_decouplage', 'ord_simul', 'ord_chrono', 'ord_premier_imp', 'ord_endurance', 'ord_reset_mental', 'ord_suivi'];
                ordCategorie = ordPCH[Math.floor(Math.random() * ordPCH.length)];
            } else if (disc === 'CS') {
                var ordCS = ['ord_cs_isole', 'ord_cs_tour', 'ord_cs_matching', 'ord_cs_deuxieme', 'ord_decouplage', 'ord_simul', 'ord_chrono', 'ord_premier_imp', 'ord_endurance', 'ord_reset_mental', 'ord_suivi'];
                ordCategorie = ordCS[Math.floor(Math.random() * ordCS.length)];
            } else {
                var ordFosse = ['ord_anticipation', 'ord_suivi', 'ord_sniper', 'ord_endurance', 'ord_reset_mental', 'ord_echauffement', 'ord_pression', 'ord_fondations', 'ord_contre_montre'];
                ordCategorie = ordFosse[Math.floor(Math.random() * ordFosse.length)];
            }
            if (ordCategorie) {
                ordPhrase = _pickPhrase(ordCategorie, disc);
            }
        }

        if (ordPhrase) {
            lignes.push('• Ordonnance : ' + ordPhrase);
        }

        return lignes.join('\n');
    }

    function _rafraichirAnalyse() {
        var scores = _getScoresAnalyse();
        var resumeEl = document.getElementById('analyse-resume-texte');

        if (scores.length === 0) {
            resumeEl.textContent = 'Aucune série enregistrée pour cette période.';
            return;
        }

        var disc = (_eleveActif && _eleveActif.disc) ? _eleveActif.disc : currentDisc;
        var modeLabel = _analyseMode === 'serie' ? 'dernière série' : _analyseMode === 'semaine' ? 'semaine' : 'mois';
        var allS = scores.map(function(s) { return parseInt(s.score); });
        var total = allS.reduce(function(a,b) { return a+b; }, 0);
        var avg = Math.round(total / allS.length * 10) / 10;
        var max = maxParSerie(disc || 'FU');
        var pctTotal = Math.round(total / (max * scores.length) * 100);

        resumeEl.textContent = scores.length + ' série(s) · Moyenne ' + pctTotal + '% · ' + modeLabel;
    }

    function afficherAnalyseEleve(nom) {
        currentTireur = nom;
        _analyseMode = 'serie';

        // Injecter le template analyse dans le container si pas encore fait
        var container = document.getElementById('analyse-eleve-container');
        if (!container) return;
        if (!document.getElementById('analyse-eleve-nom')) {
            container.innerHTML = _getAnalyseTemplate();
        }

        document.getElementById('btn-analyse-serie').classList.add('active');
        document.getElementById('btn-analyse-semaine').classList.remove('active');
        document.getElementById('btn-analyse-mois').classList.remove('active');

        document.getElementById('analyse-eleve-nom').textContent = nom;
        document.getElementById('analyse-no-eleve').style.display = 'none';
        document.getElementById('analyse-resume').style.display = 'block';
        document.getElementById('section-commentaire-coach').style.display = 'block';
        document.getElementById('section-analyse-ia-coach').style.display = 'block';
        document.getElementById('section-pdf-analyse').style.display = 'block';

        _rafraichirAnalyse();

        // Charger le commentaire coach sauvegardé
        var disc = (_eleveActif && _eleveActif.disc) ? _eleveActif.disc : currentDisc;
        var key = 'commentaire_' + nom + '_' + disc;
        if (!db.analysesCoach) db.analysesCoach = {};
        document.getElementById('analyse-commentaire-coach').value = db.analysesCoach[key] || '';

        // Charger l'analyse IA sauvegardée
        var keyIA = 'analyse_coach_' + nom + '_' + disc;
        var savedIA = db.analysesCoach[keyIA] || '';
        document.getElementById('analyse-ia-coach-texte').value = savedIA;
        document.getElementById('analyse-ia-coach-status').textContent = savedIA ? '✓ Analyse sauvegardée' : '';
    }

    function _getAnalyseTemplate() {
        return '<div id="analyse-eleve-nom" style="text-align:center;font-size:1.2rem;font-weight:900;color:var(--accent);padding:4px 0;">—</div>' +
        '<div class="stats-mode-bar">' +
            '<button class="stats-mode-btn active" id="btn-analyse-serie" onclick="setAnalyseMode(\'serie\')">Série</button>' +
            '<button class="stats-mode-btn" id="btn-analyse-semaine" onclick="setAnalyseMode(\'semaine\')">Semaine</button>' +
            '<button class="stats-mode-btn" id="btn-analyse-mois" onclick="setAnalyseMode(\'mois\')">Mensuelle</button>' +
        '</div>' +
        '<div class="card" id="analyse-resume" style="text-align:center;">' +
            '<div id="analyse-resume-texte" style="font-size:0.9rem;color:var(--text-muted);">Sélectionnez un élève pour voir l\'analyse</div>' +
        '</div>' +
        '<div class="card" id="section-commentaire-coach" style="display:none;">' +
            '<span class="stats-titre">Commentaire coach</span>' +
            '<textarea id="analyse-commentaire-coach" class="textarea-neu"' +
                ' placeholder="Votre commentaire personnel sur cette période..."' +
                ' style="height:120px;font-size:0.88rem;line-height:1.7;margin-top:10px;"' +
                ' oninput="sauvegarderCommentaireCoach()"></textarea>' +
        '</div>' +
        '<div class="card" id="section-analyse-ia-coach" style="display:none;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
                '<span class="stats-titre" style="margin:0;">Analyse IA</span>' +
                '<button id="btn-generer-analyse-coach" class="btn-main" style="width:auto;padding:8px 16px;height:auto;font-size:0.82rem;" onclick="genererAnalyseCoach()">' +
                    '<svg class="icon-sm icon-white" viewBox="0 0 24 24" style="margin:0;"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg> Analyser' +
                '</button>' +
            '</div>' +
            '<textarea id="analyse-ia-coach-texte" class="textarea-neu"' +
                ' placeholder="L\'analyse apparaîtra ici. Modifiez-la comme vous le souhaitez."' +
                ' style="height:200px;font-size:0.88rem;line-height:1.7;"' +
                ' oninput="sauvegarderAnalyseCoach()"></textarea>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">' +
                '<span class="sub" id="analyse-ia-coach-status"></span>' +
                '<button class="btn-secondary" style="width:auto;padding:0 16px;height:38px;font-size:0.78rem;" onclick="effacerAnalyseCoach()">Effacer</button>' +
            '</div>' +
        '</div>' +
        '<div id="analyse-no-eleve" style="text-align:center;padding:40px 20px;">' +
            '<p style="font-size:1.1rem;color:var(--muted)">Aucun élève sélectionné</p>' +
            '<button class="btn-nav" style="margin-top:16px;" onclick="switchTab(\'page-eleves\',document.querySelector(\'[data-page=page-eleves]\'))">Aller aux Élèves</button>' +
        '</div>' +
        '<div id="section-pdf-analyse" class="card" style="display:none;margin-top:12px;padding:12px 16px;">' +
            '<button id="btn-pdf-analyse" class="btn-main" style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:0.95rem;" onclick="genererPDFAnalyse()">' +
                '<svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>' +
                '<span id="btn-pdf-analyse-label">Export PDF — Série</span>' +
            '</button>' +
        '</div>';
    }

    function sauvegarderCommentaireCoach() {
        if (!currentTireur) return;
        var disc = (_eleveActif && _eleveActif.disc) ? _eleveActif.disc : currentDisc;
        var key = 'commentaire_' + currentTireur + '_' + disc;
        if (!db.analysesCoach) db.analysesCoach = {};
        db.analysesCoach[key] = document.getElementById('analyse-commentaire-coach').value;
        saveDB();
    }

    function sauvegarderAnalyseCoach() {
        if (!currentTireur) return;
        var disc = (_eleveActif && _eleveActif.disc) ? _eleveActif.disc : currentDisc;
        var key = 'analyse_coach_' + currentTireur + '_' + disc;
        if (!db.analysesCoach) db.analysesCoach = {};
        db.analysesCoach[key] = document.getElementById('analyse-ia-coach-texte').value;
        saveDB();
    }

    function genererAnalyseCoach() {
        if (!currentTireur) return;
        var scores = _getScoresAnalyse();
        if (!scores.length) { showToast('Pas assez de données.', 'error'); return; }

        var disc = (_eleveActif && _eleveActif.disc) ? _eleveActif.disc : currentDisc;
        var texte;
        if (_analyseMode === 'serie' && scores.length === 1) {
            texte = _analyseLocale_serie(scores[0]);
        } else if (_analyseMode === 'semaine' || _analyseMode === 'mois') {
            texte = _analyseStrategique(currentTireur, scores, _analyseMode, disc);
        } else {
            texte = _analyseLocale(currentTireur, scores);
        }

        document.getElementById('analyse-ia-coach-texte').value = texte;
        document.getElementById('analyse-ia-coach-status').textContent = '✓ Analyse générée — modifiez-la si besoin';

        var key = 'analyse_coach_' + currentTireur + '_' + disc;
        if (!db.analysesCoach) db.analysesCoach = {};
        db.analysesCoach[key] = texte;
        saveDB();
    }

    function effacerAnalyseCoach() {
        document.getElementById('analyse-ia-coach-texte').value = '';
        document.getElementById('analyse-ia-coach-status').textContent = '';
        sauvegarderAnalyseCoach();
    }

    function afficherStatsEleve(nom) {
        currentTireur = nom;

        // Injecter le template stats dans le container si pas encore fait
        var container = document.getElementById('stats-eleve-container');
        if (!container) return;
        if (!document.getElementById('stats-eleve-nom')) {
            container.innerHTML = _getStatsTemplate();
        }

        // Mode série ciblée depuis historique ?
        var estCiblee = !!window._statsSerieCiblee;

        // Gérer la barre de mode et le bouton retour
        var modeBar = container.querySelector('.stats-mode-bar');
        var retourBtn = document.getElementById('stats-retour-btn');

        if (estCiblee) {
            // Cacher les boutons de mode, montrer le bouton retour
            if (modeBar) modeBar.style.display = 'none';
            if (!retourBtn) {
                retourBtn = document.createElement('button');
                retourBtn.className = 'stats-retour-btn';
                retourBtn.id = 'stats-retour-btn';
                retourBtn.innerHTML = '← Retour au mode normal';
                retourBtn.onclick = statsRetourNormal;
                var nomEl = document.getElementById('stats-eleve-nom');
                if (nomEl && nomEl.parentNode) {
                    nomEl.parentNode.insertBefore(retourBtn, nomEl.nextSibling);
                }
            }
            retourBtn.style.display = 'flex';
            // Titre avec date de la série
            var serieCiblee = window._statsSerieCiblee;
            document.getElementById('stats-eleve-nom').textContent = nom + ' — Série du ' + (serieCiblee.date || '');
        } else {
            // Mode normal
            _statsMode = 'derniere';
            if (modeBar) modeBar.style.display = 'flex';
            if (retourBtn) retourBtn.style.display = 'none';
            document.getElementById('btn-stats-derniere').classList.add('active');
            document.getElementById('btn-stats-seance').classList.remove('active');
            document.getElementById('btn-stats-mois').classList.remove('active');
            document.getElementById('stats-eleve-nom').textContent = nom;
        }

        // Masquer tout
        document.getElementById('section-derniere-score').style.display = 'none';
        document.getElementById('section-records').style.display     = 'none';
        document.getElementById('section-radar').style.display       = 'none';
        document.getElementById('section-progression').style.display = 'none';
        document.getElementById('section-postes').style.display      = 'none';
        document.getElementById('section-doubles').style.display     = 'none';
        document.getElementById('section-escalier').style.display    = 'none';
        document.getElementById('stats-empty').style.display         = 'none';

        var allScores = db.eleves[nom] || [];
        var disc = (_eleveActif && _eleveActif.disc) ? _eleveActif.disc : currentDisc;
        var scoresDisc = disc ? allScores.filter(function(s) { return s.disc === disc; }) : allScores;

        if (!scoresDisc.length && !estCiblee) {
            var DISC_LABELS = { 'FU': 'Fosse Universelle', 'DTL': 'Fosse DTL', 'TRAP 1': 'Trap 1', 'PCH': 'Parcours de Chasse', 'CS': 'Compak Sporting' };
            document.getElementById('stats-empty').innerHTML = 'Aucune série enregistrée en ' + (DISC_LABELS[disc] || disc || '?') + '.<br>Lance une session de coaching pour commencer.';
            document.getElementById('stats-empty').style.display = 'block';
            return;
        }

        // Remplir les graphiques
        _rafraichirStats();
    }

    function _getStatsTemplate() {
        return '<div id="stats-eleve-nom" style="text-align:center;font-size:1.2rem;font-weight:900;color:var(--accent);padding:4px 0;">Nom</div>' +
        '<div class="stats-mode-bar">' +
            '<button class="stats-mode-btn active" id="btn-stats-derniere" onclick="setStatsMode(\'derniere\')">Série</button>' +
            '<button class="stats-mode-btn" id="btn-stats-seance" onclick="setStatsMode(\'seance\')">Séance</button>' +
            '<button class="stats-mode-btn" id="btn-stats-mois" onclick="setStatsMode(\'mois\')">Mois</button>' +
        '</div>' +
        '<div class="stats-section" id="section-derniere-score" style="display:none;">' +
            '<span class="stats-titre">Dernière série</span>' +
            '<div class="derniere-score-grid">' +
                '<div class="derniere-score-card">' +
                    '<div class="derniere-score-val" id="derniere-score-val">—</div>' +
                    '<span class="derniere-score-pct" id="derniere-score-pct"></span>' +
                    '<span class="record-sub" id="derniere-score-date"></span>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="stats-section" id="section-records">' +
            '<span class="stats-titre">Records</span>' +
            '<div class="record-grid">' +
                '<div class="record-card">' +
                    '<div class="record-val" id="rec-best">—</div>' +
                    '<span class="record-sub">Meilleure série</span>' +
                '</div>' +
                '<div class="record-card">' +
                    '<div class="record-val" id="rec-avg">—</div>' +
                    '<span class="record-sub">Moyenne globale</span>' +
                '</div>' +
                '<div class="record-card">' +
                    '<div class="record-val" id="rec-total">—</div>' +
                    '<span class="record-sub">Séries jouées</span>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="stats-section" id="section-radar">' +
            '<span class="stats-titre">Profil de performance</span>' +
            '<div class="chart-card">' +
                '<div class="radar-container">' +
                    '<div style="position:relative;height:220px;">' +
                        '<canvas id="chart-radar"></canvas>' +
                    '</div>' +
                    '<div class="radar-legend" id="radar-legend"></div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="stats-section" id="section-progression">' +
            '<span class="stats-titre">Progression</span>' +
            '<div class="chart-card">' +
                '<div style="position:relative;height:260px;">' +
                    '<canvas id="chart-progression"></canvas>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="stats-section" id="section-postes">' +
            '<span class="stats-titre">Réussite par poste</span>' +
            '<div class="chart-card">' +
                '<div style="position:relative;height:180px;">' +
                    '<canvas id="chart-postes"></canvas>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="stats-section" id="section-doubles" style="display:none;">' +
            '<span class="stats-titre">Détail doublés</span>' +
            '<div class="chart-card">' +
                '<div style="position:relative;height:180px;">' +
                    '<canvas id="chart-doubles"></canvas>' +
                '</div>' +
                '<div id="doubles-summary" style="display:flex;gap:8px;margin-top:10px;justify-content:center;flex-wrap:wrap;"></div>' +
            '</div>' +
        '</div>' +
        '<div class="stats-section" id="section-escalier" style="display:none;">' +
            '<span class="stats-titre">Escalier — Râtés &amp; Raccrochages</span>' +
            '<div class="chart-card">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
                    '<div id="escalier-badge" class="escalier-badge"></div>' +
                    '<div class="escalier-legend" style="display:flex;gap:10px;align-items:center;">' +
                        '<span style="display:flex;align-items:center;gap:3px;font-size:0.7rem;color:var(--text-muted);"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--v-color);"></span> Touché</span>' +
                        '<span style="display:flex;align-items:center;gap:3px;font-size:0.7rem;color:var(--text-muted);"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--o-color);"></span> Raccroché</span>' +
                        '<span style="display:flex;align-items:center;gap:3px;font-size:0.7rem;color:var(--text-muted);"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--r-color);"></span> Râté</span>' +
                    '</div>' +
                '</div>' +
                '<div class="bars-container" id="escalier-bars"></div>' +
            '</div>' +
        '</div>' +
        '<div id="stats-empty" class="empty-stats" style="display:none">' +
            'Aucune série avec grille enregistrée.<br>Lance une session de coaching pour voir les stats par poste.' +
        '</div>';
    }

    function afficherEscalier(serie) {
        if (!serie.grille || !serie.grille.length) return;
        var max = maxParSerie(serie.disc);
        var nbPlateaux = serie.grille.length;

        var badge = document.getElementById('escalier-badge');
        if (badge) badge.textContent = 'SCORE : ' + serie.score + ' / ' + max;

        var container = document.getElementById('escalier-bars');
        if (!container) return;
        container.innerHTML = '';

        var cumul = 0;
        var nbRates = 0;
        var nbRaccroches = 0;

        serie.grille.forEach(function(v, i) {
            if (v > 0) cumul++;
            if (v === 0) nbRates++;
            if (v === 2) nbRaccroches++;

            var bar = document.createElement('div');
            bar.className = 'bar-item';
            var h = cumul * (100 / nbPlateaux);
            bar.style.height = (h > 2 ? h : 2) + '%';

            // Code couleur : vert=touché 1er tir, orange=raccroché 2e tir, rouge=râté
            if (v === 1) {
                bar.style.background = 'var(--v-color)';
            } else if (v === 2) {
                bar.style.background = 'var(--o-color)';
            } else {
                bar.style.background = 'var(--r-color)';
            }

            // Marqueur visuel pour les raccrochages (petit losange en haut de barre)
            if (v === 2) {
                var marker = document.createElement('div');
                marker.style.cssText = 'position:absolute;top:-6px;left:50%;transform:translateX(-50%);width:6px;height:6px;background:var(--o-color);border-radius:50%;border:1.5px solid #fff;';
                bar.appendChild(marker);
            }

            // Labels tous les 5 plateaux
            if ((i + 1) % 5 === 0) {
                var lbl = document.createElement('div');
                lbl.className = 'bar-label';
                lbl.textContent = i + 1;
                bar.appendChild(lbl);
            }
            container.appendChild(bar);
        });

        var section = document.getElementById('section-escalier');
        if (section) section.style.display = 'block';
    }

    function _dessinerProgression(disc, scoresFilter) {
        const allScores = db.eleves[currentTireur] || [];
        const scores = scoresFilter || allScores;
        let filtre = disc === 'tous' ? scores : scores.filter(s => s.disc === disc);
        filtre = [...filtre].reverse();

        const labels  = filtre.map((s, i) => {
            const parts = s.date.split('/');
            return parts.length === 3 ? parts[0] + '/' + parts[1] : '#' + (i + 1);
        });
        const data = filtre.map(s => {
            const max = maxParSerie(s.disc);
            return Math.round((parseInt(s.score) / max) * 100);
        });
        const colors = filtre.map(s =>
            s.disc === 'FU' ? '#72d582' : s.disc === 'DTL' ? '#edcc52' :
            s.disc === 'PCH' ? '#5b9bd5' : s.disc === 'CS' ? '#ed7d31' : '#e66756'
        );

        const ctx = document.getElementById('chart-progression').getContext('2d');
        if (_chartProg) _chartProg.destroy();

        _chartProg = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data,
                    borderColor: disc === 'tous' ? '#f39c12' : (
                        disc === 'FU' ? '#72d582' : disc === 'DTL' ? '#edcc52' :
                        disc === 'PCH' ? '#5b9bd5' : disc === 'CS' ? '#ed7d31' : '#e66756'
                    ),
                    backgroundColor: 'transparent',
                    pointBackgroundColor: disc === 'tous' ? colors : undefined,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    borderWidth: 2.5,
                    tension: 0.35
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ctx.parsed.y + '%' +
                                (filtre[ctx.dataIndex] ? ' (' + filtre[ctx.dataIndex].disc + ')' : '')
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 8 },
                        grid: { display: false }
                    },
                    y: {
                        min: 0, max: 110,
                        ticks: { font: { size: 10 }, callback: v => v <= 100 ? v + '%' : '', stepSize: 25 },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    }
                }
            }
        });
    }

    function _dessinerPostes(disc, scoresFilter) {
        const allScores = db.eleves[currentTireur] || [];
        const scores = scoresFilter || allScores;
        const estPCHCS = DISC_DOUBLES.includes(disc);
        const avecGrille = scores.filter(s => s.grille && s.grille.length === 25 && s.disc === disc);

        const ctx = document.getElementById('chart-postes').getContext('2d');
        
        // Détruire l'ancien graphique AVANT de vérifier les données
        if (_chartPoste) {
            _chartPoste.destroy();
            _chartPoste = null;
        }

        if (!avecGrille.length) {
            // Labels par discipline
            var emptyLabels = estPCHCS ? ['P1', 'P2', 'P3', 'P4', 'P5'] : ['1-5', '6-10', '11-15', '16-20', '21-25'];
            var emptyData = emptyLabels.map(function() { return 0; });
            _chartPoste = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: emptyLabels,
                    datasets: [{
                        data: emptyData,
                        backgroundColor: 'rgba(150,150,150,0.3)',
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }
                    },
                    scales: {
                        x: {
                            ticks: { font: { size: 11 } },
                            grid: { display: false }
                        },
                        y: {
                            min: 0, max: 100,
                            ticks: { font: { size: 10 }, callback: v => v + '%', stepSize: 25 },
                            grid: { color: 'rgba(0,0,0,0.05)' }
                        }
                    }
                }
            });
            return;
        }

        // --- Calcul des taux par poste ---
        var labels, datasets;

        if (estPCHCS) {
            // PCH/CS : taux par poste réel — nombre dynamique, avec breakdown simples/doublés
            var postesUniquesPostes = new Set();
            avecGrille.forEach(function(s) {
                var map = grilleToMenuMap(s.menuPCH);
                if (map) {
                    for (var i = 0; i < 25; i++) {
                        if (map[i] && map[i].poste) postesUniquesPostes.add(map[i].poste);
                    }
                }
            });
            var nbPostesPCH = postesUniquesPostes.size > 0 ? postesUniquesPostes.size : 5;
            var posteList = Array.from(postesUniquesPostes).sort(function(a,b){return a-b;});
            if (posteList.length === 0) posteList = [1,2,3,4,5];

            // Accumulateurs par poste : simples vs doublés
            var simpHits = new Array(nbPostesPCH).fill(0);
            var simpTotal = new Array(nbPostesPCH).fill(0);
            var dblHits = new Array(nbPostesPCH).fill(0);
            var dblTotal = new Array(nbPostesPCH).fill(0);

            avecGrille.forEach(function(s) {
                var map = grilleToMenuMap(s.menuPCH);
                if (map) {
                    for (var i = 0; i < 25; i++) {
                        var item = map[i];
                        if (!item) continue;
                        var pIdx = posteList.indexOf(item.poste);
                        if (pIdx < 0 || pIdx >= nbPostesPCH) continue;
                        var hit = s.grille[i] > 0 ? 1 : 0;
                        if (item.type === 'simple') {
                            simpTotal[pIdx]++; simpHits[pIdx] += hit;
                        } else if (item.type === 'double') {
                            dblTotal[pIdx]++; dblHits[pIdx] += hit;
                        }
                    }
                } else {
                    // Fallback si pas de menuPCH : groupes de 5 comme simples
                    for (var g = 0; g < 5 && g < nbPostesPCH; g++) {
                        for (var j = g * 5; j < g * 5 + 5; j++) {
                            simpTotal[g]++;
                            if (s.grille[j] > 0) simpHits[g]++;
                        }
                    }
                }
            });

            labels = posteList.map(function(p) { return 'P' + p; });
            var simpTaux = simpTotal.map(function(t, i) { return t > 0 ? Math.round((simpHits[i] / t) * 100) : 0; });
            var dblTaux = dblTotal.map(function(t, i) { return t > 0 ? Math.round((dblHits[i] / t) * 100) : 0; });

            // S'il y a des doublés → 2 datasets, sinon 1
            var hasDoubles = dblTotal.some(function(t) { return t > 0; });
            if (hasDoubles) {
                datasets = [
                    {
                        label: 'Simples',
                        data: simpTaux,
                        backgroundColor: '#5b9bd5',
                        borderRadius: 4,
                        borderSkipped: false
                    },
                    {
                        label: 'Doublés',
                        data: dblTaux,
                        backgroundColor: '#ed7d31',
                        borderRadius: 4,
                        borderSkipped: false
                    }
                ];
            } else {
                datasets = [{
                    label: 'Simples',
                    data: simpTaux,
                    backgroundColor: simpTaux.map(function(v) { return v >= 80 ? '#72d582' : v >= 60 ? '#edcc52' : '#e66756'; }),
                    borderRadius: 6,
                    borderSkipped: false
                }];
            }
        } else {
            // FU/DTL/TRAP1 : groupes de 5 plateaux
            labels = ['1-5', '6-10', '11-15', '16-20', '21-25'];
            var taux = labels.map(function(_, gi) {
                let hits = 0, total = 0;
                avecGrille.forEach(function(s) {
                    for (let i = gi * 5; i < gi * 5 + 5; i++) {
                        total++;
                        if (s.grille[i] > 0) hits++;
                    }
                });
                return total ? Math.round((hits / total) * 100) : 0;
            });
            datasets = [{
                data: taux,
                backgroundColor: taux.map(v =>
                    v >= 80 ? '#72d582' : v >= 60 ? '#edcc52' : '#e66756'
                ),
                borderRadius: 6,
                borderSkipped: false
            }];
        }

        _chartPoste = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: estPCHCS && datasets.length > 1, labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
                    tooltip: { callbacks: { label: function(ctx) { return (ctx.dataset.label || '') + ' ' + ctx.parsed.y + '%'; } } }
                },
                scales: {
                    x: {
                        ticks: { font: { size: 11 } },
                        grid: { display: false }
                    },
                    y: {
                        min: 0, max: 100,
                        ticks: { font: { size: 10 }, callback: v => v + '%', stepSize: 25 },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    }
                }
            }
        });
    }

    /* =========================================================
       PCH/CS : GRAPHIQUE DOUBLÉS
       Barres groupées : 1er tir / 2e tir par type (CF / SIM)
       + Résumé en mini-tuiles sous le chart
    ========================================================= */
    function _dessinerDoubles(disc, scoresFilter) {
        var allScores = db.eleves[currentTireur] || [];
        var scores = scoresFilter || allScores;
        var avecGrille = scores.filter(function(s) { return s.grille && s.grille.length === 25 && s.disc === disc; });

        var ctx = document.getElementById('chart-doubles');
        if (!ctx) return;

        if (_chartDoubles) { _chartDoubles.destroy(); _chartDoubles = null; }

        // Accumulateurs globaux
        var s1cf = 0, t1cf = 0, s2cf = 0, t2cf = 0; // CF 1er/2e tir
        var s1sim = 0, t1sim = 0, s2sim = 0, t2sim = 0; // SIM 1er/2e tir

        avecGrille.forEach(function(serie) {
            var stats = calculerStatsDoubles(serie);
            s1cf += stats.cf1Hits; t1cf += stats.cf1Total;
            s2cf += stats.cf2Hits; t2cf += stats.cf2Total;
            s1sim += stats.sim1Hits; t1sim += stats.sim1Total;
            s2sim += stats.sim2Hits; t2sim += stats.sim2Total;
        });

        // Vérifier s'il y a des doublés
        var hasCF = (t1cf + t2cf) > 0;
        var hasSIM = (t1sim + t2sim) > 0;
        if (!hasCF && !hasSIM) {
            document.getElementById('section-doubles').style.display = 'none';
            return;
        }

        // Construction des labels et données
        var labels = [];
        var data1 = []; // 1er tir
        var data2 = []; // 2e tir

        if (hasCF) {
            labels.push('CF');
            data1.push(t1cf ? Math.round((s1cf / t1cf) * 100) : 0);
            data2.push(t2cf ? Math.round((s2cf / t2cf) * 100) : 0);
        }
        if (hasSIM) {
            labels.push('SIM');
            data1.push(t1sim ? Math.round((s1sim / t1sim) * 100) : 0);
            data2.push(t2sim ? Math.round((s2sim / t2sim) * 100) : 0);
        }

        _chartDoubles = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '1er tir',
                        data: data1,
                        backgroundColor: '#5b9bd5',
                        borderRadius: 4,
                        borderSkipped: false
                    },
                    {
                        label: '2e tir',
                        data: data2,
                        backgroundColor: '#ed7d31',
                        borderRadius: 4,
                        borderSkipped: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
                    tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ' ' + ctx.parsed.y + '%'; } } }
                },
                scales: {
                    x: { ticks: { font: { size: 11 } }, grid: { display: false } },
                    y: { min: 0, max: 100, ticks: { font: { size: 10 }, callback: function(v) { return v + '%'; }, stepSize: 25 }, grid: { color: 'rgba(0,0,0,0.05)' } }
                }
            }
        });

        // Résumé en mini-tuiles
        var summary = document.getElementById('doubles-summary');
        if (summary) {
            summary.innerHTML = '';
            var allTotal1 = t1cf + t1sim;
            var allHits1 = s1cf + s1sim;
            var allTotal2 = t2cf + t2sim;
            var allHits2 = s2cf + s2sim;
            var pct1 = allTotal1 ? Math.round((allHits1 / allTotal1) * 100) : 0;
            var pct2 = allTotal2 ? Math.round((allHits2 / allTotal2) * 100) : 0;
            var delta = pct1 - pct2;

            var tiles = [
                { label: '1er tir', value: pct1 + '%', color: '#5b9bd5' },
                { label: '2e tir', value: pct2 + '%', color: '#ed7d31' },
                { label: 'Delta', value: (delta > 0 ? '+' : '') + delta + '%', color: delta > 10 ? '#e66756' : delta > 0 ? '#edcc52' : '#72d582' }
            ];
            tiles.forEach(function(t) {
                var tile = document.createElement('div');
                tile.style.cssText = 'text-align:center;padding:6px 12px;border-radius:12px;background:var(--neu);box-shadow:var(--neu-in);min-width:70px;';
                tile.innerHTML = '<div style="font-size:0.7rem;color:var(--text-label);">' + t.label + '</div>' +
                    '<div style="font-size:1.1rem;font-weight:800;color:' + t.color + ';">' + t.value + '</div>';
                summary.appendChild(tile);
            });
        }
    }

    function setVent(v) {
        currentVent = v;
        ['faible', 'modere', 'fort'].forEach(k => {
            const btn = document.getElementById('vent-' + k);
            if (btn) btn.classList.toggle('active', k === v);
        });
    }

    /* =========================================================
       MÉTÉO DYNAMIQUE — Open-Météo API (gratuite, sans clé)
    ========================================================= */
    var _weatherCache = null;
    var _weatherCacheTime = 0;
    var _userLocation = null;

    async function chargerMeteoDynamique() {
        const tempEl = document.getElementById('meteo-temp');
        const descEl = document.getElementById('meteo-desc');
        if (!tempEl || !descEl) return;

        // Cache de 10 minutes
        const now = Date.now();
        if (_weatherCache && (now - _weatherCacheTime) < 600000) {
            afficherMeteo(_weatherCache);
            return;
        }

        // Afficher chargement
        tempEl.textContent = '📍...';
        descEl.textContent = 'Localisation...';

        try {
            // Étape 1: Géolocalisation
            if (!_userLocation) {
                _userLocation = await obtenirPosition();
            }

            // Étape 2: Appel API Open-Météo
            const meteo = await appelerOpenMeteo(_userLocation.lat, _userLocation.lon);

            // Cache
            _weatherCache = meteo;
            _weatherCacheTime = now;

            // Affichage
            afficherMeteo(meteo);

            // Suggestion de vent
            autoSelectionnerVent(meteo);

        } catch (error) {
            afficherErreurMeteo(error.message);
        }
    }

    function obtenirPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Géolocalisation non supportée'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    resolve({
                        lat: pos.coords.latitude,
                        lon: pos.coords.longitude
                    });
                },
                (err) => {
                    // Position par défaut: Paris
                    console.warn('Géoloc refusée, utilisation de Paris par défaut');
                    resolve({ lat: 48.8566, lon: 2.3522 });
                },
                { timeout: 5000, enableHighAccuracy: false }
            );
        });
    }

    async function appelerOpenMeteo(lat, lon) {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day&timezone=auto`;

        const response = await fetch(url);
        if (!response.ok) throw new Error('Erreur API météo');

        const data = await response.json();
        return {
            temp: Math.round(data.current.temperature_2m),
            code: data.current.weather_code,
            windSpeed: Math.round(data.current.wind_speed_10m),
            windDir: data.current.wind_direction_10m,
            isDay: data.current.is_day === 1,  // true = jour, false = nuit
            location: _userLocation?.name || 'Position actuelle'
        };
    }

    function afficherMeteo(meteo) {
        const iconEl = document.getElementById('meteo-icon');
        const tempEl = document.getElementById('meteo-temp');
        const descEl = document.getElementById('meteo-desc');
        const windSpeedEl = document.getElementById('meteo-wind-speed');
        const windDirEl = document.getElementById('meteo-wind-dir');

        if (!tempEl || !descEl) return;

        const icon = obtenirIconeMeteo(meteo.code, meteo.isDay);
        const desc = obtenirDescriptionMeteo(meteo.code);
        const ventDir = obtenirDirectionVent(meteo.windDir);

        if (iconEl) iconEl.textContent = icon;
        tempEl.textContent = meteo.temp + '°C';
        descEl.textContent = desc;
        if (windSpeedEl) windSpeedEl.textContent = meteo.windSpeed + ' km/h';
        if (windDirEl) windDirEl.textContent = ventDir;
    }

    function afficherErreurMeteo(msg) {
        const tempEl = document.getElementById('meteo-temp');
        const descEl = document.getElementById('meteo-desc');
        const windSpeedEl = document.getElementById('meteo-wind-speed');
        const windDirEl = document.getElementById('meteo-wind-dir');

        if (tempEl) tempEl.textContent = '⚠️';
        if (descEl) descEl.textContent = 'Météo indisponible';
        if (windSpeedEl) windSpeedEl.textContent = '-- km/h';
        if (windDirEl) windDirEl.textContent = '--';
    }

    function rafraichirMeteo() {
        _weatherCache = null;
        _userLocation = null;
        chargerMeteoDynamique();
    }

    function obtenirIconeMeteo(code, isDay = true) {
        // Codes WMO: https://open-meteo.com/en/docs
        // isDay: true = jour, false = nuit
        
        if (code === 0) {
            return isDay ? '☀️' : '🌙';  // Clair : soleil ou lune
        }
        if (code === 1 || code === 2) {
            return isDay ? '⛅' : '☁️';  // Partiellement nuageux
        }
        if (code === 3) {
            return '☁️';  // Couvert (pareil jour/nuit)
        }
        if (code <= 48) {
            return '🌫️';  // Brouillard
        }
        if (code <= 57) {
            return '🌧️';  // Bruine
        }
        if (code <= 67) {
            return '🌧️';  // Pluie
        }
        if (code <= 77) {
            return '🌨️';  // Neige
        }
        if (code <= 82) {
            return '🌧️';  // Averses
        }
        if (code <= 86) {
            return '🌨️';  // Neige
        }
        if (code <= 99) {
            return '⛈️';  // Orage
        }
        return isDay ? '🌤️' : '🌙';
    }

    function obtenirDescriptionMeteo(code) {
        if (code === 0) return 'Ciel clair';
        if (code === 1) return 'Principalement clair';
        if (code === 2) return 'Partiellement nuageux';
        if (code === 3) return 'Couvert';
        if (code <= 48) return 'Brouillard';
        if (code <= 57) return 'Bruine';
        if (code <= 67) return 'Pluie';
        if (code <= 77) return 'Neige';
        if (code <= 82) return 'Averses';
        if (code <= 86) return 'Averses de neige';
        if (code <= 99) return 'Orage';
        return 'Variable';
    }

    function obtenirDirectionVent(deg) {
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
        const idx = Math.round(deg / 45) % 8;
        return dirs[idx];
    }

    function autoSelectionnerVent(meteo) {
        // Sauvegarde les données météo API
        currentMeteoAPI = {
            code: meteo.code,
            temp: meteo.temp,
            windSpeed: meteo.windSpeed,
            windDir: meteo.windDir,
            isDay: meteo.isDay,
            desc: obtenirDescriptionMeteo(meteo.code)
        };

        // Suggestion de vent basée sur le vent API
        const wind = meteo.windSpeed;

        if (wind >= 30) {
            setVent('fort');
        } else if (wind >= 15) {
            setVent('modere');
        } else {
            setVent('faible');
        }
    }

    /* =========================================================
       HELPER : MAX PLATEAUX PAR SÉRIE SELON DISCIPLINE
    ========================================================= */
    function maxParSerie(disc) {
        return (disc === 'FU' || disc === 'PCH' || disc === 'CS') ? 25 : 75;
    }

    /* =========================================================
       PCH/CS : MAPPING GRILLE → MENU
       Un doublé = 1 item menu mais 2 indices grille (1er tir + 2e tir)
       Cette fonction renvoie un tableau de 25 éléments,
       chacun pointant vers l'item menuPCH correspondant.
    ========================================================= */
    function grilleToMenuMap(menuPCH) {
        if (!menuPCH || !menuPCH.length) return null;
        var map = [];
        var gIdx = 0;
        for (var m = 0; m < menuPCH.length && gIdx < 25; m++) {
            var item = menuPCH[m];
            if (!item) continue;
            map[gIdx] = item;
            gIdx++;
            if (item.type === 'double' && gIdx < 25) {
                map[gIdx] = item; // 2e tir du doublé = même item menu
                gIdx++;
            }
        }
        return map.length === 25 ? map : null;
    }

    /* =========================================================
       PCH/CS : STATS DOUBLÉS D'UNE SÉRIE
       Retourne { simplesHits, simplesTotal, doubles1Hits, doubles1Total,
                  doubles2Hits, doubles2Total, cfHits, cfTotal, simHits, simTotal }
    ========================================================= */
    function calculerStatsDoubles(serie) {
        var result = {
            simplesHits: 0, simplesTotal: 0,
            doubles1Hits: 0, doubles1Total: 0,
            doubles2Hits: 0, doubles2Total: 0,
            cf1Hits: 0, cf1Total: 0, cf2Hits: 0, cf2Total: 0,
            sim1Hits: 0, sim1Total: 0, sim2Hits: 0, sim2Total: 0
        };
        var map = grilleToMenuMap(serie.menuPCH);
        if (!map) return result;
        for (var i = 0; i < 25; i++) {
            var item = map[i];
            if (!item) continue;
            var hit = serie.grille[i] > 0 ? 1 : 0;
            if (item.type === 'simple') {
                result.simplesHits += hit;
                result.simplesTotal++;
            } else if (item.type === 'double') {
                // Détecter si c'est le 1er ou 2e tir du doublé
                var isFirst = (i === 0 || map[i - 1] !== item);
                if (isFirst) {
                    result.doubles1Hits += hit;
                    result.doubles1Total++;
                    if (item.sousType === 'CF') { result.cf1Hits += hit; result.cf1Total++; }
                    else if (item.sousType === 'SIM') { result.sim1Hits += hit; result.sim1Total++; }
                } else {
                    result.doubles2Hits += hit;
                    result.doubles2Total++;
                    if (item.sousType === 'CF') { result.cf2Hits += hit; result.cf2Total++; }
                    else if (item.sousType === 'SIM') { result.sim2Hits += hit; result.sim2Total++; }
                }
            }
        }
        return result;
    }

    /* =========================================================
       PCH/CS : GÉNÉRATION DU MENU SÉQUENTIEL
       Chaque item = {type:'simple'|'double', poste:N, ...}
       La grille finale = 25 valeurs (0 ou 1), 1 par plateau
    ========================================================= */
    function genererMenuPCH(disc, ligne, posteSpecial, posteDepart) {
        const menu = [];
        const typesDoubl = disc === 'PCH' ? ['CF','SIM','RAF'] : ['CF','SIM'];
        const machines5 = ['A','B','C','D','E'];
        const machines6 = ['A','B','C','D','E','F'];

        // Structure des postes selon le type de ligne (toujours indexé à partir de 1)
        let postesDef;
        if (ligne === 3) {
            postesDef = [
                { simples: 5, doubles: 2 },
                { simples: 5, doubles: 2 },
                { simples: 5, doubles: 1 }
            ];
        } else if (ligne === 4) {
            const ps = posteSpecial || 2;
            postesDef = [
                { simples: 4, doubles: 1 },
                { simples: ps === 2 ? 3 : 4, doubles: ps === 2 ? 2 : 1 },
                { simples: ps === 3 ? 3 : 4, doubles: ps === 3 ? 2 : 1 },
                { simples: 4, doubles: 1 }
            ];
        } else { // 5 postes
            postesDef = [
                { simples: 3, doubles: 1 },
                { simples: 3, doubles: 1 },
                { simples: 3, doubles: 1 },
                { simples: 3, doubles: 1 },
                { simples: 3, doubles: 1 }
            ];
        }

        // Rotation des postes en fonction du poste de départ
        // Si on démarre au poste 3 (sur 5), l'ordre devient : 3,4,5,1,2
        const pd = parseInt(posteDepart) || 1;
        const nbPostes = postesDef.length;
        const postes = [];
        for (let i = 0; i < nbPostes; i++) {
            const idx = ((pd - 1 + i) % nbPostes);
            postes.push({ ...postesDef[idx], posteOriginal: idx + 1 });
        }

        postes.forEach((p, idx) => {
            const posteNum = p.posteOriginal;
            const nbMachines = p.simples + p.doubles + (p.doubles > 0 ? 1 : 0); // Approximation
            const machines = disc === 'CS' ? machines6 : machines5;

            // Simples d'abord
            for (let s = 0; s < p.simples; s++) {
                menu.push({
                    type: 'simple',
                    poste: posteNum,
                    machine: machines[s % machines.length]
                });
            }

            // Puis doublés
            for (let d = 0; d < p.doubles; d++) {
                const sousType = typesDoubl[(d + idx) % typesDoubl.length];
                const m1 = machines[(p.simples + d * 2) % machines.length];
                const m2 = machines[(p.simples + d * 2 + 1) % machines.length];
                menu.push({
                    type: 'double',
                    poste: posteNum,
                    sousType: sousType,
                    machines: [m1, m2]
                });
            }
        });

        return menu;
    }

    /* =========================================================
       CS : GÉNÉRATION DU MENU SÉQUENTIEL À PARTIR DE LA GRILLE
       Lit la grille officielle FITASC et génère le menu de tirs
       Rotation des postes : comme FU (si départ P3 → 3,4,5,1,2)
    ========================================================= */
    function genererMenuCS(grilleNum, posteDepart) {
        if (grilleNum < 1 || grilleNum > 40) return [];
        const grille = CS_GRILLES[grilleNum - 1]; // index 0-based
        if (!grille) return [];

        const menu = [];
        const pd = parseInt(posteDepart) || 1;

        // Rotation simple comme FU : si départ poste 3 → ordre 3,4,5,1,2
        const postes = [];
        for (let i = 0; i < 5; i++) {
            postes.push(((pd - 1 + i) % 5) + 1);
        }

        // Pour chaque poste dans l'ordre de rotation
        postes.forEach(p => {
            const posteData = grille[p - 1]; // index 0-based
            const posteNum = p;

            // Simples d'abord
            if (posteData.s && posteData.s.length > 0) {
                for (const machine of posteData.s) {
                    menu.push({
                        type: 'simple',
                        poste: posteNum,
                        machine: machine
                    });
                }
            }

            // Puis doublés
            if (posteData.d) {
                // Peut être un objet (1 doublé) ou un array (2 doublés)
                const doubles = Array.isArray(posteData.d) ? posteData.d : [posteData.d];
                for (const dbl of doubles) {
                    menu.push({
                        type: 'double',
                        poste: posteNum,
                        sousType: dbl.type, // 'CF' ou 'SIM'
                        machines: dbl.m
                    });
                }
            }
        });

        return menu;
    }

    /* =========================================================
       CALCUL POSTE RÉEL SELON DISCIPLINE ET POSTE DE DÉPART
    ========================================================= */
    function calculerPoste(numPlateau, discipline, posteDepart) {
        if (!posteDepart) return numPlateau;
        const poste = parseInt(posteDepart);
        
        if (discipline === 'DTL') {
            // DTL : 5 plateaux par poste
            const groupe = Math.floor((numPlateau - 1) / 5);
            return ((groupe + poste - 1) % 5) + 1;
        } else if (DISC_DOUBLES.includes(discipline)) {
            // PCH/CS : poste affiché selon le menu PCH
            if (_menuPCH.length > 0 && numPlateau <= _menuPCH.length) {
                return _menuPCH[numPlateau - 1].poste;
            }
            return numPlateau; // Fallback
        } else {
            // FU et TRAP 1 : 1 plateau par poste, rotation continue
            return ((numPlateau - 1 + poste - 1) % 5) + 1;
        }
    }

    /* =========================================================
       PCH/CS : Afficher le contexte du tir en cours
    ========================================================= */
    function _updateContextPCHCS() {
        const ctx = document.getElementById('context-pch-cs');
        if (!DISC_DOUBLES.includes(currentDisc) || _menuPCH.length === 0) {
            if (ctx) ctx.style.display = 'none';
            return;
        }
        if (ctx) ctx.style.display = 'block';

        const item = _menuPCH[_indexMenu];
        if (!item) {
            document.getElementById('pch-cs-label').textContent = 'Terminé';
            document.getElementById('pch-cs-detail').textContent = '';
            document.getElementById('pch-cs-type-badge').textContent = '';
            return;
        }

        // Calcul du plateau dans le poste pour CS (1 à 5)
        var plateauDansPoste = '';
        if (currentDisc === 'CS' && _menuPCH.length > 0) {
            var count = 0;
            for (var i = 0; i <= _indexMenu; i++) {
                if (_menuPCH[i].poste === item.poste) {
                    count += (_menuPCH[i].type === 'double') ? 2 : 1;
                }
            }
            plateauDansPoste = ' \u00B7 ' + count + '/5';
        }

        if (item.type === 'simple') {
            document.getElementById('pch-cs-detail').textContent = 'Poste ' + item.poste + plateauDansPoste;
            document.getElementById('pch-cs-label').textContent = 'Simple ' + item.machine;
            document.getElementById('pch-cs-type-badge').textContent = 'SIMPLE';
            document.getElementById('pch-cs-type-badge').style.background = 'var(--accent)';
        } else {
            const sousLabels = { 'CF': 'Coup de fusil', 'SIM': 'Simultané', 'RAF': 'Rafale' };
            document.getElementById('pch-cs-detail').textContent = 'Poste ' + item.poste + plateauDansPoste;
            document.getElementById('pch-cs-label').textContent = 'Doublé ' + item.machines.join('+');
            document.getElementById('pch-cs-type-badge').textContent = item.sousType + ' \u2014 ' + (sousLabels[item.sousType] || '');
            document.getElementById('pch-cs-type-badge').style.background = 'var(--o-color)';
        }
    }

    /* =========================================================
       PCH/CS : Enregistrer un simple (1 plateau = 1 case grille)
    ========================================================= */
    function enregistrerSimplePCH(t) {
        if (serieEnCours.length >= 25 || _indexMenu >= _menuPCH.length) return;
        // Pour PCH/CS, on stocke 1 (touché) ou 0 (raté) — pas de 2ème coup
        serieEnCours.push(t === 0 ? 0 : 1);
        directionsEnCours.push(t === 2 ? '2ecoup' : null);
        _indexMenu++;
        sauvegarderSerieTemp();
        updateTirUI();
    }

    /* =========================================================
       PCH/CS : Enregistrer un doublé (2 plateaux = 2 cases grille)
    ========================================================= */
    function enregistrerDoublePCH(r1, r2) {
        if (serieEnCours.length >= 24 || _indexMenu >= _menuPCH.length) return; // 24 car on ajoute 2 valeurs
        // Chaque plateau du doublé = 1 case dans la grille
        serieEnCours.push(r1);
        serieEnCours.push(r2);
        directionsEnCours.push(null);
        directionsEnCours.push(null);
        _indexMenu++;
        sauvegarderSerieTemp();
        updateTirUI();
    }

    /* =========================================================
       PCH/CS : No Bird — plateau à rejeter, ne compte pas
    ========================================================= */
    function enregistrerNoBird() {
        _noBirdCount++;
        showToast('No Bird ! Plateau ' + _noBirdCount + ' — à remettre', 'info');
        // On n'avance pas _indexMenu, le tireur doit retirer
    }

    function lancerCoaching(disc) {
        currentDisc = disc;
        serieEnCours = [];
        directionsEnCours = [];
        _noBirdCount = 0;
        if(typeof annulerDirection === 'function') annulerDirection();

        // ---- PCH/CS : Générer le menu séquentiel ----
        if (disc === 'CS') {
            if (!_csGrilleNum || _csGrilleNum < 1 || _csGrilleNum > 40) {
                showToast('Entrez un numéro de grille CS (1-40) avant de lancer.', 'error');
                return;
            }
            _menuPCH = genererMenuCS(_csGrilleNum, currentPoste);
            _indexMenu = 0;
        } else if (disc === 'PCH') {
            _menuPCH = genererMenuPCH(disc, _lignePCH, _posteSpecialPCH, currentPoste);
            _indexMenu = 0;
        } else {
            _menuPCH = [];
            _indexMenu = 0;
        }

        // --- 🌟 NOUVEAU : CRÉATION DU DOSSIER COMPÉTITION ---
        if (!db.activeComps) db.activeComps = {};
        
        // Si on a cliqué sur 100 ou 200, et qu'il n'y a pas déjà de comp en cours
        if (currentModeComp > 0 && !db.activeComps[currentTireur]) {
            db.activeComps[currentTireur] = {
                id: Date.now(),
                mode: currentModeComp,
                disc: disc,
                series: [] // On stockera les scores ici plus tard
            };
            saveDB();
        }
        
        // Sécurité : Si une comp est DÉJÀ en cours, on force la discipline
        if (db.activeComps[currentTireur]) {
            currentDisc = db.activeComps[currentTireur].disc;
            disc = currentDisc;
        }
        // --- FIN NOUVEAU ---
        currentVent = 'faible';  // Réinitialisation
        document.getElementById('note-coach').value = "";
        chargerMeteoDynamique();
        const posteLabel = currentPoste ? ' · P' + currentPoste : '';
        const grilleLabel = (disc === 'CS' && _csGrilleNum) ? ' · G' + _csGrilleNum : '';
        document.getElementById('badge-tir').textContent = currentTireur + " | " + disc + posteLabel + grilleLabel;
        const g = document.getElementById('grid-25');
        g.innerHTML = "";
        for (let i = 1; i <= 25; i++) {
            const t = document.createElement('div');
            t.style.cssText = 'width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:900;color:var(--text-muted);background:var(--bg);box-shadow:2px 2px 5px var(--shadow-dark),-2px -2px 5px var(--shadow-light);flex-shrink:0;';
            // Afficher le numéro de poste réel au lieu du numéro de plateau
            t.textContent = calculerPoste(i, disc, currentPoste);
            g.appendChild(t);
        }
        
        sauvegarderSerieTemp(); // Initialise la sauvegarde temp
        requestWakeLock();      // Demande le maintien de l'écran allumé
        
        updateTirUI();
        switchTab('page-tir', null);
    }

    function quitterTir() {
        showConfirm("Abandonner la série en cours ?", (ok) => {
            if (ok) {
                effacerSerieTemp();
                switchTab('page-coaching', null);
            }
        });
    }

    // --- NOUVELLE LOGIQUE DE SAISIE À 2 TEMPS ---
    function enregistrerDirect(t) {
        if (serieEnCours.length < 25) { 
            serieEnCours.push(t); 
            directionsEnCours.push(null); // Pas de direction si cassé au 1er coup
            sauvegarderSerieTemp(); 
            updateTirUI(); 
        }
    }

    function demanderDirection(t) {
        if (serieEnCours.length >= 25) return;
        actionEnAttente = t;
        document.getElementById('etape-principale').style.display = 'none';
        document.getElementById('etape-directions').style.display = 'flex';
        
        // Colore les boutons en orange (2) ou rouge (0)
        const color = t === 2 ? 'var(--o-color)' : 'var(--r-color)';
        document.querySelectorAll('.btn-dir').forEach(btn => btn.style.background = color);
    }

    function enregistrerAvecDirection(dir) {
        if (serieEnCours.length < 25 && actionEnAttente !== null) {
            serieEnCours.push(actionEnAttente);
            directionsEnCours.push(dir);
            sauvegarderSerieTemp();
            updateTirUI();
        }
        annulerDirection();
    }

    function annulerDirection() {
        actionEnAttente = null;
        const divDir = document.getElementById('etape-directions');
        const divPrin = document.getElementById('etape-principale');
        if(divDir) divDir.style.display = 'none';
        if(divPrin) divPrin.style.display = 'flex';
    }

    function annulerDernierCoup() {
        if (serieEnCours.length === 0) return;
        const estPCHCS = DISC_DOUBLES.includes(currentDisc);

        if (estPCHCS && _menuPCH.length > 0) {
            // PCH/CS : il faut reculer dans _indexMenu
            // Déterminer combien de valeurs le dernier item du menu a ajouté
            // On recule _indexMenu de 1 et on retire les valeurs correspondantes
            if (_indexMenu > 0) {
                _indexMenu--;
                const item = _menuPCH[_indexMenu];
                const nbVals = item.type === 'double' ? 2 : 1;
                for (let i = 0; i < nbVals && serieEnCours.length > 0; i++) {
                    serieEnCours.pop();
                    directionsEnCours.pop();
                }
            }
        } else {
            serieEnCours.pop();
            directionsEnCours.pop();
        }
        sauvegarderSerieTemp();
        annulerDirection();
        updateTirUI();
    }

    function updateTirUI() {
        const tiles  = document.querySelectorAll('#grid-25 div');
        const estPCHCS = DISC_DOUBLES.includes(currentDisc);

        if (estPCHCS && _menuPCH.length > 0) {
            // ==== MODE PCH / CS ====
            // serieEnCours contient 25 valeurs (0 ou 1), 1 par plateau
            // Les doublés occupent 2 cases consécutives dans la grille
            // On colorie les cases selon les résultats
            const colors = { 1: 'var(--v-color)', 0: 'var(--r-color)' };
            const labels = { 1: '/', 0: '●' };

            serieEnCours.forEach((v, i) => {
                if (!tiles[i]) return;
                tiles[i].style.background = colors[v] || 'var(--bg)';
                tiles[i].style.color      = 'white';
                tiles[i].style.boxShadow  = 'none';
                tiles[i].textContent      = labels[v] || '';
                tiles[i].style.fontSize   = '0.65rem';
            });

            // Cases vides restantes : afficher le label (machine CS ou poste PCH)
            // Construire le mapping plateau→label pour CS
            var csLabels = [];
            if (currentDisc === 'CS' && _menuPCH.length > 0) {
                _menuPCH.forEach(item => {
                    if (item.type === 'simple') { csLabels.push(item.machine); }
                    else if (item.type === 'double') { csLabels.push(item.machines[0]); csLabels.push(item.machines[1]); }
                });
            }
            for (let i = serieEnCours.length; i < 25; i++) {
                if (!tiles[i]) continue;
                tiles[i].style.background = 'var(--bg)';
                tiles[i].style.color      = 'var(--text-muted)';
                tiles[i].style.boxShadow  = '2px 2px 5px var(--shadow-dark),-2px -2px 5px var(--shadow-light)';
                tiles[i].textContent      = (currentDisc === 'CS' && csLabels[i]) ? csLabels[i] : calculerPoste(i + 1, currentDisc, currentPoste);
                tiles[i].style.fontSize   = '0.65rem';
            }

            // Score PCH/CS : chaque plateau vaut 0 ou 1, max 25
            const scoreVal = serieEnCours.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
            document.getElementById('score-live').textContent = scoreVal;

            // Bouton valider quand 25 plateaux atteints
            document.getElementById('btn-valider-serie').style.display =
                (serieEnCours.length === 25) ? 'block' : 'none';

            // Mettre à jour le contexte PCH/CS
            _updateContextPCHCS();

            // Afficher/masquer les boutons selon le type de tir à venir
            const prochaineItem = _menuPCH[_indexMenu];
            const divSimples = document.getElementById('etape-simples-pch');
            const divDoubles = document.getElementById('etape-doubles-pch');
            const divPrincipale = document.getElementById('etape-principale');

            divPrincipale.style.display = 'none';
            divSimples.style.display = 'none';
            divDoubles.style.display = 'none';

            if (prochaineItem) {
                if (prochaineItem.type === 'double') {
                    divDoubles.style.display = 'block';
                } else {
                    divSimples.style.display = 'flex';
                }
            }

            // Masquer l'indicateur de contexte pour les non-PCH
            document.getElementById('context-pch-cs').style.display = 'block';

        } else {
            // ==== MODE FU / DTL / TRAP 1 (inchangé) ====
            const colors = { 1: 'var(--v-color)', 2: 'var(--o-color)', 0: 'var(--r-color)' };
            const labels = { 1: '/', 2: 'X', 0: '●' };
            serieEnCours.forEach((v, i) => {
                tiles[i].style.background = colors[v];
                tiles[i].style.color      = 'white';
                tiles[i].style.boxShadow  = 'none';
                tiles[i].textContent      = labels[v];
                tiles[i].style.fontSize   = '0.65rem';
            });
            for (let i = serieEnCours.length; i < 25; i++) {
                tiles[i].style.background = 'var(--bg)';
                tiles[i].style.color      = 'var(--text-muted)';
                tiles[i].style.boxShadow  = '2px 2px 5px var(--shadow-dark),-2px -2px 5px var(--shadow-light)';
                tiles[i].textContent      = calculerPoste(i + 1, currentDisc, currentPoste);
                tiles[i].style.fontSize   = '0.65rem';
            }
            const scoreVal = (currentDisc === 'DTL' || currentDisc === 'TRAP 1')
                ? serieEnCours.reduce((a, b) => a + (b === 1 ? 3 : (b === 2 ? 2 : 0)), 0)
                : serieEnCours.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
            document.getElementById('score-live').textContent = scoreVal;
            document.getElementById('btn-valider-serie').style.display =
                (serieEnCours.length === 25) ? 'block' : 'none';

            // Masquer les éléments PCH/CS
            document.getElementById('etape-principale').style.display = 'flex';
            document.getElementById('etape-simples-pch').style.display = 'none';
            document.getElementById('etape-doubles-pch').style.display = 'none';
            document.getElementById('context-pch-cs').style.display = 'none';
        }
    }

    function validerSerie() {
        const scoreVal = parseInt(document.getElementById('score-live').textContent, 10);
        const noteEl = document.getElementById('note-coach');
        const note = noteEl ? noteEl.value.slice(0, 500) : '';

        // Construction de la note avec météo et vent
        const ventLabels = { faible: 'Vent faible', modere: 'Vent modéré', fort: 'Vent fort' };
        const ventIcon = { faible: '～', modere: '💨', fort: '🌀' };
        
        let meteoNote = '';
        if (currentMeteoAPI) {
            meteoNote = `[${currentMeteoAPI.temp}°C - ${currentMeteoAPI.desc}] `;
        }
        if (currentVent !== 'faible') {
            meteoNote += `[${ventIcon[currentVent]} ${ventLabels[currentVent]}] `;
        }
        const noteFinal = meteoNote + note;

        // 1. On crée l'objet de la série tirée
        const nouvelleSerie = {
            id: Date.now(), disc: currentDisc, score: scoreVal,
            date: new Date().toLocaleDateString('fr-FR'),
            note: noteFinal,
            poste: currentPoste,
            vent: currentVent,
            meteoAPI: currentMeteoAPI,
            grille: [...serieEnCours],
            directions: [...directionsEnCours],
            tireur: currentTireur,
            // PCH/CS : stocker le menu pour pouvoir relire la structure
            menuPCH: (DISC_DOUBLES.includes(currentDisc) && _menuPCH.length > 0) ? [..._menuPCH] : undefined,
            lignePCH: DISC_DOUBLES.includes(currentDisc) ? _lignePCH : undefined,
            // CS : stocker catégorie et grille
            csGrilleNum: currentDisc === 'CS' ? _csGrilleNum : undefined,
            noBirdCount: _noBirdCount || 0,
            // Fusil & chokes
            fusil: getCoachingFusilNom(),
            fusilId: _coachingFusilId || '',
            chokes: getCoachingChokes(),
            chokesAmovibles: (function() {
                const f = (db.arsenal || []).find(g => g.id === _coachingFusilId);
                if (f && f.chokeType === 'amovibles') {
                    return {
                        c1: document.getElementById('coaching-choke1')?.value || '',
                        c2: document.getElementById('coaching-choke2')?.value || ''
                    };
                }
                return undefined;
            })()
        };

        // 2. On l'ajoute à l'historique général (pour les stats globales)
        if (!db.eleves[currentTireur]) db.eleves[currentTireur] = [];
        db.eleves[currentTireur].unshift(nouvelleSerie);

        // --- 🌟 3. NOUVEAU : GESTION DU REMPLISSAGE DE LA COMPÉTITION ---
        let msgToast = 'Série enregistrée !';
        
        if (db.activeComps && db.activeComps[currentTireur]) {
            const comp = db.activeComps[currentTireur];
            comp.series.push(nouvelleSerie.id); // On glisse le numéro de la série dans le dossier
            
            const totalRequis = comp.mode === 100 ? 4 : 8;
            
            if (comp.series.length >= totalRequis) {
                msgToast = `🏆 Compétition terminée !`;
                const compDataPourPDF = JSON.parse(JSON.stringify(comp)); 
                
                // --- ARCHIVAGE ---
                if (!db.archivesComps) db.archivesComps = {};
                if (!db.archivesComps[currentTireur]) db.archivesComps[currentTireur] = [];
                
                compDataPourPDF.dateFin = new Date().toLocaleDateString('fr-FR');
                db.archivesComps[currentTireur].unshift(compDataPourPDF);
                
                delete db.activeComps[currentTireur];
                
              setTimeout(() => {
                    // On demande le bouton "GÉNÉRER PDF" en orange (--accent)
                    showConfirm("🏆 Concours terminé ! Générer le Super-PDF ?", (ok) => {
                        if (ok) genererSuperPDF(currentTireur, compDataPourPDF);
                    }, "GÉNÉRER PDF", "var(--accent)");
                }, 600);  

            } else {
                // ⏳ LE CONCOURS CONTINUE
                msgToast = `Série compétition ajoutée (${comp.series.length} / ${totalRequis})`;
            }
        }
        
        effacerSerieTemp();
        saveDB();
        
        // Reset du poste de départ : retour au poste 1
        _coachingPoste = 1;
        currentPoste = null;
        const postesBtns = document.querySelectorAll('#coaching-postes .btn-poste');
        postesBtns.forEach(b => b.classList.remove('active'));
        if (postesBtns[0]) postesBtns[0].classList.add('active');
        
        showToast(msgToast, 'success');
        switchTab('page-coaching', null); // Retour à la page coaching
    }

    function supprimerArchive(tireur, index) {
        showConfirm("Supprimer ce dossier de compétition ? (Vos séries resteront intactes dans l'historique global)", (ok) => {
            if (!ok) return;
            if (db.archivesComps && db.archivesComps[tireur]) {
                db.archivesComps[tireur].splice(index, 1);
                saveDB();
                refreshFicheEleve(); // Fait disparaître le tiroir instantanément
                showToast('Dossier de compétition supprimé.', 'info');
            }
        });
    }

    /* =========================================================
       EXPORT / IMPORT
    ========================================================= */
    async function exporterData() {
        const json = JSON.stringify(db, null, 2);
        const fileName = 'balltrap-backup-' + new Date().toISOString().slice(0, 10) + '.json';

        // PRIORITÉ : Téléchargement du fichier JSON
        try {
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            
            // Cleanup après un court délai
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            
            showToast('📥 Fichier téléchargé : ' + fileName, 'success');
            return;
        } catch (e) {
            console.warn('Téléchargement impossible, fallback presse-papier:', e);
        }

        // FALLBACK : Presse-papier (si téléchargement impossible)
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(json);
                showToast('📋 Données copiées dans le presse-papier !', 'success');
                return;
            } catch (e) {
                showToast('Export impossible sur cet appareil.', 'error');
            }
        }
    }

    /* =========================================================
       PARAMÈTRES (IndexedDB + localStorage fallback)
    ========================================================= */
    const PARAMS_KEY_LS = 'BALLTRAP_PARAMS'; // Ancien clé localStorage (migration)
    var _paramsCache = null;

    async function loadParamsAsync() {
        if (!idb) {
            try {
                const raw = localStorage.getItem(PARAMS_KEY_LS);
                return raw ? JSON.parse(raw) : { nomCoach: '', discFav: 'FU', theme: '#f39c12', darkMode: false };
            } catch(e) { return { nomCoach: '', discFav: 'FU', theme: '#f39c12', darkMode: false }; }
        }
        try {
            const row = await idbGet('settings', 'ui');
            _paramsCache = (row && row.data) ? row.data : { nomCoach: '', discFav: 'FU', theme: '#f39c12', darkMode: false };
            return _paramsCache;
        } catch(e) { return { nomCoach: '', discFav: 'FU', theme: '#f39c12', darkMode: false }; }
    }

    function loadParams() {
        return _paramsCache || { nomCoach: '', discFav: 'FU', theme: '#f39c12', darkMode: false };
    }

    async function sauvegarderParamsAsync() {
        const isDark = document.documentElement.classList.contains('dark-mode');
        const coachNomEl = document.getElementById('param-nom-coach');
        const p = {
            nomCoach: coachNomEl ? coachNomEl.value.trim() : (loadCoach().nom || ''),
            discFav:  (_paramsCache?.discFav) || 'FU',
            theme:    document.querySelector('.color-dot.active')?.dataset.color || '#f39c12',
            darkMode: isDark
        };
        _paramsCache = p;
        if (idb) {
            await idbPut('settings', { key: 'ui', data: p });
        } else {
            try { localStorage.setItem(PARAMS_KEY_LS, JSON.stringify(p)); } catch(e) {}
        }
        appliquerTheme(p.theme);
    }

    // Sync wrapper for inline onclick handlers
    function sauvegarderParams() {
        sauvegarderParamsAsync();
    }

    function appliquerTheme(color) {
        document.documentElement.style.setProperty('--accent', color);
    }

    function setTheme(dot) {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        sauvegarderParams();
    }

    function toggleDarkModeGlobal() {
        const isDark = document.documentElement.classList.contains('dark-mode');
        setDarkMode(!isDark);
    }

    function updateThemeColorMeta() {
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (!themeColorMeta) return;
        const isHighVis = document.documentElement.classList.contains('high-vis');
        const isDark = document.documentElement.classList.contains('dark-mode');
        if (isHighVis) {
            themeColorMeta.setAttribute('content', '#ffffff');
        } else if (isDark) {
            themeColorMeta.setAttribute('content', '#383f50');
        } else {
            themeColorMeta.setAttribute('content', '#e0e5ec');
        }
    }

    function setDarkMode(on) {
        if (on) {
            document.documentElement.classList.add('dark-mode');
            document.body.classList.add('dark-mode');
        } else {
            document.documentElement.classList.remove('dark-mode');
            document.body.classList.remove('dark-mode');
        }

        /* Redessine le radar si visible pour appliquer les nouvelles couleurs */
        if (_chartRadar && document.getElementById('section-radar')?.style.display !== 'none') {
            _dessinerRadar(_discRadar || 'FU');
        }
        
        sauvegarderParams();
        updateThemeColorMeta();

    }
    /* =========================================================
       GESTION DU MODE PLEIN SOLEIL
    ========================================================= */
    function toggleModeSoleil(actif) {
        const root = document.documentElement;
        if (actif) {
            root.classList.add('high-vis');
            localStorage.setItem('theme_soleil', 'oui');
            showToast("Mode Plein Soleil activé 🌞", "success");
        } else {
            root.classList.remove('high-vis');
            localStorage.setItem('theme_soleil', 'non');
            showToast("Mode normal restauré ☁️", "info");
        }
        updateThemeColorMeta();
    }

    function chargerThemeSoleil() {
        const themeSauve = localStorage.getItem('theme_soleil');
        const checkbox = document.getElementById('checkbox-soleil');
        
        if (themeSauve === 'oui') {
            document.documentElement.classList.add('high-vis');
            if (checkbox) checkbox.checked = true;
        } else {
            document.documentElement.classList.remove('high-vis');
            if (checkbox) checkbox.checked = false;
        }
        
        // On met à jour la couleur de la barre système dans TOUS les cas
        updateThemeColorMeta();
    }

    function appliquerParamsAuDemarrage() {
        const p = loadParams();
        appliquerTheme(p.theme);
        setDarkMode(p.darkMode || false);

        const discFav = p.discFav;
        const ordre   = [discFav, ...['FU','DTL','TRAP 1','PCH','CS'].filter(d => d !== discFav)];
        const modalInner  = document.getElementById('modal-disc-inner');
        const btnAnnuler  = modalInner.querySelector('.btn-secondary');
        modalInner.querySelectorAll('.btn-choice').forEach(b => b.remove());
        const labels = { 'FU': 'FOSSE UNIVERSELLE', 'DTL': 'FOSSE DTL', 'TRAP 1': 'TRAP 1', 'PCH': 'PARCOURS DE CHASSE', 'CS': 'COMPAK SPORTING' };
        ordre.forEach(d => {
            const btn  = document.createElement('button');
            btn.className = 'btn-choice';
            const txt  = document.createTextNode(labels[d] + ' ');
            const span = document.createElement('span');
            span.textContent = '›';
            btn.append(txt, span);
            btn.onclick = () => selectionnerDisc(d);
            modalInner.insertBefore(btn, btnAnnuler);
        });

        if (p.nomCoach) {
            const logoSub = document.querySelector('.logo-sub');
            if (logoSub) logoSub.textContent = p.nomCoach + ' — Coach';
        }
    }

    /* =========================================================
       HELPERS NAVIGATION
    ========================================================= */
    function ouvrirChoixDisc() {
        document.getElementById('modal-disc').style.display = 'flex';
    }

    /* =========================================================
       EXPORT PDF — RAPPORTS
    ========================================================= */

    /* =========================================================
       PDF HELPERS — encodage et pagination
    ========================================================= */
    function stripEmojis(str) {
        return (str || '')
            .replace(/🌟/g, '')
            .replace(/🔥/g, '')
            .replace(/📈/g, '')
            .replace(/📊/g, '')
            .replace(/🏆/g, '')
            .replace(/⚠️/g, '! ')
            .replace(/⚠/g, '! ')
            .replace(/📍/g, '> ')
            .replace(/🧠/g, '> ')
            .replace(/⚡/g, '> ')
            .replace(/💪/g, '')
            .replace(/🎯/g, '')
            .replace(/🔴/g, '! ')
            .replace(/✅/g, '')
            .replace(/❌/g, '')
            .replace(/✓/g, '')
            .replace(/✗/g, '')
            .replace(/►/g, '>')
            .replace(/★/g, '')
            .replace(/●/g, '-')
            .replace(/↑/g, '')
            .replace(/☀️/g, 'Soleil')
            .replace(/⛅/g, 'Nuageux')
            .replace(/💨\s*/g, '')
            .replace(/🌧️/g, 'Pluie')
            .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
            .replace(/[\u{2600}-\u{27FF}]/gu, '')
            .replace(/[^\x00-\xFF\n]/g, '')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
    }

    function pdfAddSectionWithPageBreak(doc, y, neededHeight, margin) {
        const pageHeight = doc.internal.pageSize.getHeight();
        const footerH = 20;
        if (y + neededHeight > pageHeight - footerH) {
            doc.addPage();
            return (margin || 20);
        }
        return y;
    }

    function pdfFooter(doc, today) {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setDrawColor(PDF_COLORS.MEDIUM_GRAY);
            doc.setLineWidth(0.5);
            doc.line(14, 280, 196, 280);
            doc.setTextColor(PDF_COLORS.TEXT_LIGHT);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text('Ball-Trap Master Pro V1.3 — Application de Coaching', 105, 286, { align: 'center' });
            doc.text('Généré le ' + today + '  |  Page ' + i + '/' + pageCount, 105, 291, { align: 'center' });
        }
    }

    const PDF_COLORS = {
        ACCENT: '#f39c12',
        DARK_NAVY: '#2c3e50',
        DARKER_NAVY: '#1a252f',
        SOFT_GRAY: '#ecf0f1',
        MEDIUM_GRAY: '#bdc3c7',
        TEXT_DARK: '#2c3e50',
        TEXT_LIGHT: '#7f8c8d',
        GREEN: '#27ae60',
        GREEN_LIGHT: '#2ecc71',
        ORANGE: '#f39c12',
        RED: '#e66756',    // harmonisé avec --r-color
        BLUE: '#3498db'    // harmonisé avec --info-color
    };
    function genererSuperPDF(nom, compData) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const today = new Date().toLocaleDateString('fr-FR');

        // 1. Récupération des données et Stats Historiques
        const toutesLesSeries = db.eleves[nom] || [];
        const seriesConcours = compData.series.map(id => toutesLesSeries.find(s => s.id === id)).filter(Boolean);

        if (seriesConcours.length === 0) {
            showToast("Erreur: Séries introuvables.", "error");
            return;
        }

        const totalPlateaux = compData.mode;
        const maxParSerie = (compData.disc === 'FU' || compData.disc === 'PCH' || compData.disc === 'CS') ? 25 : 75;
        const scoreParfait = (totalPlateaux / 25) * maxParSerie;
        const scoreTotal = seriesConcours.reduce((a, s) => a + parseInt(s.score), 0);
        const pctGlobal = Math.round((scoreTotal / scoreParfait) * 100);

        const statsEleve = _calculerStatsEleve(nom, compData.disc);
        let moyenneHabituelle = statsEleve ? Math.round(statsEleve.moyenne) : pctGlobal;

        // ================= PAGE 1 : EN-TÊTE =================
        doc.setFillColor(PDF_COLORS.DARKER_NAVY);
        doc.rect(0, 0, 210, 35, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text('BILAN DE COMPÉTITION', 105, 18, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PDF_COLORS.ACCENT);
        doc.text(`TOURNOI SUR ${totalPlateaux} PLATEAUX`, 105, 26, { align: 'center' });

        let y = 50;
        doc.setTextColor(PDF_COLORS.TEXT_DARK);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text(nom.toUpperCase(), 14, y);
        doc.setTextColor(PDF_COLORS.TEXT_LIGHT);
        doc.setFontSize(11);
        doc.text(`${today} — ${compData.disc}`, 196, y, { align: 'right' });

        doc.setDrawColor(PDF_COLORS.ACCENT);
        doc.setLineWidth(1.5);
        doc.line(14, y + 5, 196, y + 5);

        // LE GROS SCORE CENTRAL
        y = 65;
        doc.setFillColor(PDF_COLORS.SOFT_GRAY);
        doc.roundedRect(14, y, 182, 40, 4, 4, 'F');
        doc.setTextColor(PDF_COLORS.ACCENT);
        doc.setFontSize(42);
        doc.setFont('helvetica', 'bold');
        doc.text(`${scoreTotal} / ${scoreParfait}`, 105, y + 18, { align: 'center' });
        
        let couleurPct = pctGlobal >= 80 ? '#2ecc71' : (pctGlobal >= 60 ? '#f39c12' : '#e66756');
        doc.setTextColor(couleurPct);
        doc.setFontSize(16);
        doc.text(`${pctGlobal}% de réussite globale`, 105, y + 30, { align: 'center' });

        // TABLEAU DES SÉRIES
        y += 55;
        doc.setTextColor(PDF_COLORS.DARK_NAVY);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('DÉTAIL DES SÉRIES', 14, y);

        const tableDataOrdered = [['Série', 'Score', '%', 'Poste', 'Météo']];
        seriesConcours.forEach((s, idx) => {
            const pctSerie = Math.round((parseInt(s.score) / maxParSerie) * 100);
            tableDataOrdered.push([
                `Série ${idx + 1}`,
                `${s.score} / ${maxParSerie}`,
                `${pctSerie}%`,
                s.poste ? `P${s.poste}` : '-',
                s.vent ? (s.vent === 'fort' ? 'Vent fort' : s.vent === 'modere' ? 'Vent mod.' : 'Calme') : '-'
            ]);
        });

        doc.autoTable({
            startY: y + 5,
            head: [tableDataOrdered[0]],
            body: tableDataOrdered.slice(1),
            theme: 'grid',
            headStyles: { fillColor: PDF_COLORS.DARK_NAVY, textColor: 255, fontSize: 10 },
            bodyStyles: { fontSize: 10, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: PDF_COLORS.SOFT_GRAY },
            columnStyles: { 
                0: { cellWidth: 35 }, 1: { cellWidth: 35 }, 2: { cellWidth: 30 },
                3: { cellWidth: 30 }, 4: { cellWidth: 'auto' }
            }
        });

        // ================= 🧠 ANALYSE DE LA VARIANCE PAR SÉRIE =================
        // 🔧 CORRECTION : Ajout de la vérification de saut de page (45px requis)
        y = doc.lastAutoTable.finalY + 15;
        y = pdfAddSectionWithPageBreak(doc, y, 45, 20);
        
        const scoresS = seriesConcours.map(s => parseInt(s.score));
        const bestScore = Math.max(...scoresS);
        const worstScore = Math.min(...scoresS);
        const diffScore = bestScore - worstScore;
        const diffPct = Math.round((diffScore / maxParSerie) * 100);

        const bestSeriesIdx = scoresS.map((s, i) => s === bestScore ? i + 1 : null).filter(Boolean).join(', ');
        const worstSeriesIdx = scoresS.map((s, i) => s === worstScore ? i + 1 : null).filter(Boolean).join(', ');

        doc.setTextColor(PDF_COLORS.DARK_NAVY);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('ANALYSE INDIVIDUELLE DES SÉRIES', 14, y);
        y += 7;

        doc.setFontSize(10);
        doc.setTextColor(PDF_COLORS.TEXT_DARK);
        doc.setFont('helvetica', 'normal');

        if (diffScore === 0) {
             doc.text(`• Constance absolue : Toutes tes séries ont été tirées au même score (${bestScore}/${maxParSerie}).`, 18, y);
             y += 10;
        } else {
             doc.text(`• Meilleure(s) : Série(s) ${bestSeriesIdx} avec un score de ${bestScore}/${maxParSerie}.`, 18, y);
             y += 6;
             doc.text(`• Plus difficile(s) : Série(s) ${worstSeriesIdx} avec un score de ${worstScore}/${maxParSerie}.`, 18, y);
             y += 6;
             
             let comVariance = `• Écart de performance : ${diffScore} plateau(x) de différence entre ta meilleure et ta pire série. `;
             
             if (diffPct <= 8) {
                 comVariance += `Excellente régularité, ton niveau est resté très homogène sur l'ensemble des postes.`;
             } else if (diffPct <= 16) {
                 comVariance += `Une variance classique. La série la plus faible t'a coûté quelques points, mais pas de gros décrochage.`;
             } else {
                 comVariance += `L'écart est important. La série ${worstSeriesIdx} a lourdement pénalisé ton bilan. Il faudra isoler ce qui a causé ce décrochage (météo, fatigue, relâchement mental ?).`;
             }
             
             const varLines = doc.splitTextToSize(comVariance, 175);
             doc.text(varLines, 18, y);
             y += varLines.length * 5 + 5;
        }

       // ================= 📊 DASHBOARD : PROGRESSION & ZONES =================
        y = pdfAddSectionWithPageBreak(doc, y, 70, 20); 

        // Dessin des deux boîtes côte à côte
        doc.setFillColor(PDF_COLORS.SOFT_GRAY);
        doc.roundedRect(14, y, 88, 55, 3, 3, 'F'); // Boîte Gauche
        doc.roundedRect(108, y, 88, 55, 3, 3, 'F'); // Boîte Droite

        // --- GAUCHE : COURBE DE PROGRESSION ---
        doc.setFontSize(10);
        doc.setTextColor(PDF_COLORS.DARK_NAVY);
        doc.setFont('helvetica', 'bold');
        doc.text("COURBE DES SCORES", 58, y + 8, { align: 'center' });

        const graphX = 20;
        const graphY = y + 20;
        const graphW = 76;
        const graphH = 16;
        const minScoreScale = Math.max(0, worstScore - (maxParSerie * 0.1));
        const amplitude = maxParSerie - minScoreScale || 1;

        const pts = scoresS.map((score, i) => ({
            x: graphX + (graphW / (scoresS.length + 1)) * (i + 1),
            y: graphY + graphH - ((score - minScoreScale) / amplitude) * graphH,
            score: score
        }));

        // La ligne
        doc.setDrawColor(PDF_COLORS.ACCENT);
        doc.setLineWidth(1);
        for(let i=0; i < pts.length - 1; i++) {
            doc.line(pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
        }

        // Les points et labels
        pts.forEach((pt, i) => {
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(PDF_COLORS.ACCENT);
            doc.setLineWidth(0.6);
            doc.circle(pt.x, pt.y, 2, 'FD');
            
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(PDF_COLORS.DARK_NAVY);
            doc.text(`${pt.score}`, pt.x, pt.y - 3, { align: 'center' });
            
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(PDF_COLORS.TEXT_LIGHT);
            doc.text(`S${i+1}`, pt.x, graphY + graphH + 5, { align: 'center' });
        });

        // --- DROITE : ANALYSE DES ZONES ---
        doc.setFontSize(10);
        doc.setTextColor(PDF_COLORS.DARK_NAVY);
        doc.setFont('helvetica', 'bold');
        doc.text("ANALYSE DES ZONES", 152, y + 8, { align: 'center' });

        const avecGrille = seriesConcours.filter(s => s.grille && s.grille.length === 25);
        let totalRates = 0;
        let deuxiemesCoups = 0;
        const zonesPct = [0, 0, 0, 0, 0];
        const zonesLabels = ['1-5', '6-10', '11-15', '16-20', '21-25'];
        let maxI = 0, minI = 0;

        if (avecGrille.length > 0) {
            const zonesHits = [0, 0, 0, 0, 0];
            const zonesTotal = [0, 0, 0, 0, 0];

            avecGrille.forEach(s => {
                s.grille.forEach((val, i) => {
                    const groupe = Math.floor(i / 5);
                    zonesTotal[groupe]++;
                    if (val > 0) zonesHits[groupe]++;
                    if (val === 0) totalRates++;
                    if (val === 2) deuxiemesCoups++;
                });
            });

            zonesHits.forEach((h, i) => { zonesPct[i] = Math.round((h / zonesTotal[i]) * 100); });
            maxI = zonesPct.indexOf(Math.max(...zonesPct));
            minI = zonesPct.indexOf(Math.min(...zonesPct));

            let zoneY = y + 16;
            zonesPct.forEach((pct, i) => {
                doc.setFontSize(8);
                doc.setTextColor(PDF_COLORS.TEXT_DARK);
                doc.setFont('helvetica', 'bold');
                doc.text(zonesLabels[i], 112, zoneY + 3);

                doc.setFillColor(236, 240, 241);
                doc.roundedRect(128, zoneY - 1, 46, 5, 2, 2, 'F');

                let barColor = pct >= 80 ? '#2ecc71' : (pct >= 60 ? '#f39c12' : '#e66756');
                doc.setFillColor(barColor);
                let w = Math.max((46 * pct) / 100, 1.5);
                doc.roundedRect(128, zoneY - 1, w, 5, 2, 2, 'F');

                doc.text(`${pct}%`, 178, zoneY + 3);
                zoneY += 7.5;
            });
        } else {
            doc.setFontSize(8);
            doc.setTextColor(PDF_COLORS.TEXT_LIGHT);
            doc.setFont('helvetica', 'italic');
            doc.text("Aucune donnée de zone.", 152, y + 30, { align: 'center' });
        }

        y += 60; // On descend sous le double-dashboard
        
        // --- TEXTE DE CONCLUSION ZONES ---
        if (avecGrille.length > 0) {
            doc.setFontSize(9);
            doc.setTextColor(PDF_COLORS.TEXT_DARK);
            doc.setFont('helvetica', 'normal');
            if (Math.min(...zonesPct) === 100) {
                doc.text(`• Perfection absolue : Toutes les zones sont à 100% de réussite.`, 14, y);
            } else {
                doc.text(`• Point fort : Tirs ${zonesLabels[maxI]} (${zonesPct[maxI]}%)  |  • Zone fragile : Tirs ${zonesLabels[minI]} (${zonesPct[minI]}%)`, 14, y);
            }
            y += 6;
            
            doc.setFillColor(253, 242, 233);
            doc.roundedRect(14, y, 182, compData.disc !== 'FU' ? 14 : 9, 2, 2, 'F');
            doc.setTextColor(PDF_COLORS.ACCENT);
            doc.setFont('helvetica', 'bold');
            doc.text(`Total plateaux manqués purs sur la compétition : ${totalRates}`, 18, y + 6);
            if (compData.disc !== 'FU') {
                doc.text(`Total plateaux sauvés au 2ème coup : ${deuxiemesCoups}`, 18, y + 11);
            }
            y += (compData.disc !== 'FU' ? 22 : 16);
        }

        // ================= ENDURANCE =================
        y = pdfAddSectionWithPageBreak(doc, y, 75, 20);
        doc.setTextColor(PDF_COLORS.DARK_NAVY);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text("ENDURANCE ET RÉGULARITÉ", 14, y);

        const mid = Math.floor(seriesConcours.length / 2);
        const firstHalf = seriesConcours.slice(0, mid);
        const secondHalf = seriesConcours.slice(mid);
        const score1 = firstHalf.reduce((a,s)=>a+parseInt(s.score),0);
        const score2 = secondHalf.reduce((a,s)=>a+parseInt(s.score),0);
        const maxHalf = mid * maxParSerie;
        
        let pct1 = maxHalf > 0 ? Math.round(score1/maxHalf*100) : 0;
        let pct2 = maxHalf > 0 ? Math.round(score2/maxHalf*100) : 0;

        y += 8;
        doc.setFillColor(PDF_COLORS.SOFT_GRAY);
        doc.roundedRect(14, y, 88, 25, 3, 3, 'F');
        doc.roundedRect(108, y, 88, 25, 3, 3, 'F');

        doc.setFontSize(9);
        doc.setTextColor(PDF_COLORS.TEXT_LIGHT);
        doc.text("PREMIÈRE MOITIÉ", 58, y + 7, { align: 'center' });
        doc.text("SECONDE MOITIÉ", 152, y + 7, { align: 'center' });

        doc.setFontSize(18);
        doc.setTextColor(PDF_COLORS.TEXT_DARK);
        doc.setFont('helvetica', 'bold');
        doc.text(`${score1} / ${maxHalf}`, 58, y + 16, { align: 'center' });
        doc.text(`${score2} / ${maxHalf}`, 152, y + 16, { align: 'center' });

        doc.setFontSize(11);
        doc.setTextColor(pct1 >= 80 ? '#2ecc71' : (pct1 >= 60 ? '#f39c12' : '#e66756'));
        doc.text(`${pct1}%`, 58, y + 22, { align: 'center' });
        doc.setTextColor(pct2 >= 80 ? '#2ecc71' : (pct2 >= 60 ? '#f39c12' : '#e66756'));
        doc.text(`${pct2}%`, 152, y + 22, { align: 'center' });

        y += 32;
        let enduranceText = "";
        const delta = score2 - score1;
        const margeErreur = Math.round(maxHalf * 0.05); 

        if (pctGlobal === 100) enduranceText = "Physique et mental d'acier. Tenir la perfection sur l'intégralité du concours prouve une endurance de très haut niveau.";
        else if (delta < -margeErreur) enduranceText = "Baisse de régime sur la deuxième partie du concours. La fatigue mentale ou physique a pesé sur tes dernières séries. L'endurance sera l'axe de travail principal.";
        else if (delta > margeErreur) enduranceText = "Superbe remontée ! Tu as mis du temps à entrer dans ton match, mais tu as su élever ton niveau pour finir beaucoup plus fort.";
        else enduranceText = "Une régularité impressionnante du début à la fin. Ton rythme est resté constant sur la totalité du concours.";

        doc.setTextColor(PDF_COLORS.TEXT_DARK);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        const endLines = doc.splitTextToSize(enduranceText, 175);
        doc.text(endLines, 14, y);
        y += endLines.length * 5 + 10;

        // ================= DÉBRIEFING INTELLIGENT DE L'IA =================
        y = pdfAddSectionWithPageBreak(doc, y, 70, 20);
        doc.setTextColor(PDF_COLORS.DARK_NAVY);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('ANALYSE GLOBALE DU COACH', 14, y);

        y += 8;
        doc.setTextColor(PDF_COLORS.TEXT_DARK);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        let debrief = "";
        const diffMoyenne = pctGlobal - moyenneHabituelle;

        if (pctGlobal === 100) {
            debrief = `Une masterclass absolue. Clôturer un tournoi de ${totalPlateaux} plateaux sans trembler et avec un score parfait de ${scoreTotal}/${scoreParfait} relève de l'exploit sportif. \n\nL'endurance mentale, la rigueur de la routine et l'agressivité visuelle ont été maintenues du premier au dernier plateau. Ce n'est plus de la chance à ce niveau, c'est de la maîtrise totale. Range le fusil et savoure.`;
        } else {
            if (statsEleve && statsEleve.nbSeries >= 4) {
                if (diffMoyenne >= 5) debrief += `Un tournoi exceptionnel qui se solde par une performance bien supérieure à ta moyenne habituelle (${moyenneHabituelle}%). Tu as su élever ton niveau de jeu au bon moment. `;
                else if (diffMoyenne <= -5) debrief += `Un concours difficile, en deçà de tes standards habituels (${moyenneHabituelle}%). La pression ou la fatigue ont perturbé ta routine. `;
                else debrief += `Une performance solide, parfaitement alignée avec ton niveau moyen actuel (${moyenneHabituelle}%). `;
            } else {
                debrief += `Clôturer un tournoi de ${totalPlateaux} plateaux est toujours un marathon mental exigeant. `;
            }

            if (pctGlobal >= 90) debrief += `Avec ${pctGlobal}% de réussite, tu maintiens un niveau de concentration digne des podiums. `;
            else if (pctGlobal >= 75) debrief += `Tu as produit de belles séries, mais la compétition sanctionne le moindre relâchement. Les quelques "trous d'air" coûtent cher au classement général. `;
            else debrief += `Le bilan comptable est sévère, mais c'est une excellente base de travail pour identifier tes priorités d'entraînement. `;

            if (totalRates > 0 && Math.min(...zonesPct) < 100) {
                debrief += `\n\nTechniquement, l'analyse montre que les tirs ${zonesLabels[minI]} (${zonesPct[minI]}% de réussite) constituent ton angle mort sur la durée. C'est l'accumulation de ces petites erreurs géographiques qui creuse l'écart avec la perfection. `;
            }

            if (compData.disc !== 'FU' && deuxiemesCoups >= (totalPlateaux * 0.15)) {
                debrief += `\n\nAttention également à la réactivité : avec ${deuxiemesCoups} plateaux sauvés au 2ème coup, tu t'exposes trop. Ton premier coup manque d'anticipation ou de tranchant. En compétition, on ne peut pas compter indéfiniment sur la cartouche de rattrapage.`;
            } else if (pctGlobal < 100) {
                debrief += `\n\nLe mot d'ordre pour la suite : consolider la routine sur les zones d'inconfort pour éviter de donner des points faciles.`;
            }
        }

        const debriefLines = doc.splitTextToSize(stripEmojis(debrief), 174);
        const debriefHeight = debriefLines.length * 5 + 8;
        
        doc.setFillColor(255, 248, 225); 
        doc.setDrawColor(PDF_COLORS.ACCENT);
        doc.setLineWidth(0.5);
        doc.roundedRect(14, y-4, 182, debriefHeight, 3, 3, 'FD');
        doc.text(debriefLines, 18, y + 2);

        pdfFooter(doc, today);
        doc.save(`bilan-competition-${nom.replace(/\s+/g, '-')}-${today.replace(/\//g, '-')}.pdf`);
    }

    function genererPDFAnalyse() {
        if (!currentTireur) { showToast('Aucun élève sélectionné.', 'error'); return; }

        var scores = _getScoresAnalyse();
        if (!scores.length) { showToast('Pas assez de données pour générer le PDF.', 'error'); return; }

        if (_analyseMode === 'serie') {
            genererRapportJournee(scores[0]);
        } else if (_analyseMode === 'semaine') {
            genererRapportSemaine();
        } else {
            genererRapportMensuel();
        }
    }

    function genererRapportPeriode(nbJours, titreRapport, prefixFichier) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const nom = currentTireur;
        const series = db.eleves[nom] || [];
        const today = new Date().toLocaleDateString('fr-FR');

        // Filtrer la période
        const dateDebut = new Date();
        dateDebut.setDate(dateDebut.getDate() - nbJours);
        dateDebut.setHours(0, 0, 0, 0);
        const seriesPeriode = series.filter(s => {
            const d = _parseHistoDate(s.date);
            return d && d >= dateDebut;
        });

        // ========== HEADER ==========
        doc.setFillColor(PDF_COLORS.DARKER_NAVY);
        doc.rect(0, 0, 210, 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('BALL-TRAP MASTER PRO', 105, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Application de Coaching · ' + titreRapport, 105, 23, { align: 'center' });

        // ========== NOM ÉLÈVE ==========
        doc.setTextColor(PDF_COLORS.TEXT_DARK);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(nom.toUpperCase(), 14, 45);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PDF_COLORS.TEXT_LIGHT);
        doc.text('Rapport du ' + today, 196, 45, { align: 'right' });

        // Ligne orange
        doc.setDrawColor(PDF_COLORS.ACCENT);
        doc.setLineWidth(1.5);
        doc.line(14, 50, 196, 50);

        // ========== KPI ==========
        const allScores = seriesPeriode.map(s => {
            const max = (s.disc === 'FU' || s.disc === 'PCH' || s.disc === 'CS') ? 25 : 75;
            return Math.round(parseInt(s.score) / max * 100);
        });
        const avg = allScores.length ? Math.round(allScores.reduce((a,b) => a+b, 0) / allScores.length) : 0;
        const best = allScores.length ? Math.max(...allScores) : 0;
        const nbSeries = seriesPeriode.length;

        // Progression dynamique
        let progressionStr = 'N/A';
        if (allScores.length >= 2) {
            const mid = Math.floor(allScores.length / 2);
            const oldAvg = Math.round(allScores.slice(mid).reduce((a,b) => a+b, 0) / (allScores.length - mid));
            const newAvg = Math.round(allScores.slice(0, mid).reduce((a,b) => a+b, 0) / mid);
            const delta = newAvg - oldAvg;
            progressionStr = (delta >= 0 ? '+' : '') + delta + '%';
        }

        const kpiY = 58;
        const kpiW = 42;
        const kpiH = 22;
        const kpiData = [
            { label: 'Moyenne', value: avg + '%', x: 14 },
            { label: 'Séries', value: nbSeries.toString(), x: 61 },
            { label: 'Meilleur', value: best + '%', x: 108 },
            { label: 'Progression', value: progressionStr, x: 155 }
        ];

        kpiData.forEach(kpi => {
            doc.setFillColor(PDF_COLORS.SOFT_GRAY);
            doc.roundedRect(kpi.x, kpiY, kpiW, kpiH, 3, 3, 'F');
            doc.setTextColor(PDF_COLORS.ACCENT);
            doc.setFontSize(20);
            doc.setFont('helvetica', 'bold');
            doc.text(kpi.value, kpi.x + kpiW/2, kpiY + 12, { align: 'center' });
            doc.setTextColor(PDF_COLORS.TEXT_LIGHT);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(kpi.label, kpi.x + kpiW/2, kpiY + 18, { align: 'center' });
        });

        // ========== STATS PAR DISCIPLINE ==========
        let y = 90;
        doc.setTextColor(PDF_COLORS.ACCENT);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('PERFORMANCES PAR DISCIPLINE', 14, y);

        y += 5;
        const discData = [['Discipline', 'Séries', 'Moyenne', 'Meilleur', 'Tendance']];
        ['FU', 'DTL', 'TRAP 1', 'PCH', 'CS'].forEach(disc => {
            const s = seriesPeriode.filter(x => x.disc === disc);
            if (s.length) {
                const max = (disc === 'FU' || disc === 'PCH' || disc === 'CS') ? 25 : 75;
                const scores = s.map(x => Math.round(parseInt(x.score)/max*100));
                const moy = Math.round(scores.reduce((a,b) => a+b, 0) / scores.length);
                const bestD = Math.max(...scores);
                let tendStr = '[=]';
                if (s.length >= 2) {
                    const mid = Math.floor(s.length/2);
                    const o = Math.round(scores.slice(mid).reduce((a,b) => a+b, 0) / (s.length - mid));
                    const n = Math.round(scores.slice(0, mid).reduce((a,b) => a+b, 0) / mid);
                    tendStr = n > o+3 ? '[+]' : n < o-3 ? '[-]' : '[=]';
                }
                discData.push([disc, s.length.toString(), moy + '%', bestD + '%', tendStr]);
            }
        });

        doc.autoTable({
            startY: y,
            head: [discData[0]],
            body: discData.slice(1),
            theme: 'grid',
            headStyles: { fillColor: PDF_COLORS.DARK_NAVY, textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: PDF_COLORS.SOFT_GRAY },
            margin: { left: 14, right: 14 },
            tableWidth: 'auto',
            columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 25 }, 2: { cellWidth: 30 }, 3: { cellWidth: 30 }, 4: { cellWidth: 25 } }
        });

        // ========== ANALYSE PAR POSTES ==========
        y = doc.lastAutoTable.finalY + 12;
        doc.setTextColor(PDF_COLORS.ACCENT);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('ANALYSE PAR POSTES', 14, y);

        const postesHits = [0,0,0,0,0];
        const postesTotal = [0,0,0,0,0];
        seriesPeriode.forEach(s => {
            if (s.grille && s.grille.length === 25) {
                s.grille.forEach((val, i) => {
                    const posteReel = calculerPoste(i + 1, s.disc, s.poste);
                    postesTotal[posteReel - 1]++;
                    if (val > 0) postesHits[posteReel - 1]++;
                });
            }
        });
        const postesPct = postesTotal.map((t, i) => t ? Math.round(postesHits[i]/t*100) : 0);

        y += 5;
        const postesData = [['Poste', 'Taux', 'Niveau', 'Observation']];
        const postesLabels = ['P1', 'P2', 'P3', 'P4', 'P5'];
        const niveaux = postesPct.map(p => p >= 80 ? 'Excellent' : p >= 70 ? 'Bon' : p >= 60 ? 'Correct' : 'À travailler');
        postesLabels.forEach((p, i) => {
            postesData.push([p, postesPct[i] + '%', niveaux[i], '']);
        });

        doc.autoTable({
            startY: y,
            head: [postesData[0]],
            body: postesData.slice(1),
            theme: 'grid',
            headStyles: { fillColor: PDF_COLORS.DARK_NAVY, textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: PDF_COLORS.SOFT_GRAY },
            columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 25 }, 2: { cellWidth: 40 }, 3: { cellWidth: 'auto' } },
            margin: { left: 14, right: 14 }
        });

        // ========== DERNIÈRES SÉRIES ==========
        y = doc.lastAutoTable.finalY + 12;
        doc.setTextColor(PDF_COLORS.ACCENT);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('DERNIÈRES SÉRIES', 14, y);

        y += 5;
        const histData = [['Date', 'Disc.', 'Score', '%', 'Notes']];
        seriesPeriode.slice(0, 5).forEach(s => {
            const max = (s.disc === 'FU' || s.disc === 'PCH' || s.disc === 'CS') ? 25 : 75;
            const pct = Math.round(parseInt(s.score)/max*100);
            const noteStripped = stripEmojis(s.note || '');
            const noteClean = noteStripped
                .replace(/\[[^\]]*°[^\]]*\]/g, '')
                .replace(/\[\s*[Vv]ent[^\]]*\]/gi, '')
                .replace(/\[\s*\]/g, '')
                .replace(/\s+/g, ' ')
                .trim().substring(0, 40) || '-';
            histData.push([s.date, s.disc, s.score + '/' + max, pct + '%', noteClean]);
        });

        doc.autoTable({
            startY: y,
            head: [histData[0]],
            body: histData.slice(1),
            theme: 'grid',
            headStyles: { fillColor: PDF_COLORS.DARK_NAVY, textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: PDF_COLORS.SOFT_GRAY },
            columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 22 }, 2: { cellWidth: 22 }, 3: { cellWidth: 18 }, 4: { cellWidth: 'auto' } },
            margin: { left: 14, right: 14 }
        });

        // ========== RECOMMANDATIONS ==========
        y = doc.lastAutoTable.finalY + 12;
        y = pdfAddSectionWithPageBreak(doc, y, 35, 20);
        doc.setTextColor(PDF_COLORS.ACCENT);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('RECOMMANDATIONS', 14, y);

        y += 5;
        const minIdx = postesPct.indexOf(Math.min(...postesPct.filter(p => p > 0)));
        const posteFaible = postesLabels[minIdx >= 0 ? minIdx : 0];
        const tauxFaible  = postesPct[minIdx >= 0 ? minIdx : 0];

        doc.setFillColor(252, 228, 236);
        doc.roundedRect(14, y, 182, 18, 3, 3, 'F');
        doc.setTextColor(PDF_COLORS.RED);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('PRIORITÉ: Poste ' + posteFaible + ' (' + tauxFaible + '%)', 18, y + 7);
        doc.setTextColor(PDF_COLORS.TEXT_DARK);
        doc.setFont('helvetica', 'normal');
        doc.text('Travaille les exercices spécifiques sur ce poste.', 18, y + 13);

        // ========== ANALYSE COACH ==========
        var disc = (_eleveActif && _eleveActif.disc) ? _eleveActif.disc : currentDisc;
        var keyIA = 'analyse_coach_' + nom + '_' + disc;
        var analyseCoachTexte = (db.analysesCoach && db.analysesCoach[keyIA]) || '';
        if (analyseCoachTexte) {
            y += 26;
            y = pdfAddSectionWithPageBreak(doc, y, 20, 20);
            doc.setTextColor(PDF_COLORS.ACCENT);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('ANALYSE COACH', 14, y);
            y += 6;
            doc.setTextColor(PDF_COLORS.TEXT_DARK);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            const bilanParas = stripEmojis(analyseCoachTexte)
                .split(/\\n|\n/);
            bilanParas.forEach(para => {
                if (!para.trim()) { y += 3; return; }
                const bl = doc.splitTextToSize(para.trim(), 178);
                bl.forEach(line => {
                    y = pdfAddSectionWithPageBreak(doc, y, 6, 20);
                    doc.text(line, 16, y);
                    y += 5;
                });
            });
        }

        // ========== BILAN COACH STRATÉGIQUE (multi-séries) ==========
        const analyseGlobale = ensureAnalyseGlobale(nom);
        if (analyseGlobale) {
            y += 8;
            y = pdfAddSectionWithPageBreak(doc, y, 20, 20);
            doc.setTextColor(PDF_COLORS.ACCENT);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('BILAN COACH', 14, y);
            y += 6;
            doc.setTextColor(PDF_COLORS.TEXT_DARK);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            const bilanParas = stripEmojis(analyseGlobale)
                .split(/\\n|\n/);
            bilanParas.forEach(para => {
                if (!para.trim()) { y += 3; return; }
                const bl = doc.splitTextToSize(para.trim(), 178);
                bl.forEach(line => {
                    y = pdfAddSectionWithPageBreak(doc, y, 6, 20);
                    doc.text(line, 16, y);
                    y += 5;
                });
            });
        }

        // ========== COMMENTAIRE COACH ==========
        var keyCom = 'commentaire_' + nom + '_' + disc;
        var commentaireTexte = (db.analysesCoach && db.analysesCoach[keyCom]) || '';
        if (commentaireTexte) {
            y += 8;
            y = pdfAddSectionWithPageBreak(doc, y, 20, 20);
            doc.setTextColor(PDF_COLORS.ACCENT);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('COMMENTAIRE COACH', 14, y);
            y += 6;
            doc.setTextColor(PDF_COLORS.TEXT_DARK);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'italic');
            const comParas = commentaireTexte.split(/\n/);
            comParas.forEach(para => {
                if (!para.trim()) { y += 3; return; }
                const cl = doc.splitTextToSize(para.trim(), 178);
                cl.forEach(line => {
                    y = pdfAddSectionWithPageBreak(doc, y, 6, 20);
                    doc.text(line, 16, y);
                    y += 5;
                });
            });
        }

        // ========== FOOTER ==========
        pdfFooter(doc, today);
        doc.save(prefixFichier + '-' + nom.replace(/\s+/g, '-') + '-' + today.replace(/\//g, '-') + '.pdf');
    }

    function genererRapportSemaine() {
        genererRapportPeriode(7, 'Rapport Hebdomadaire', 'rapport-semaine');
    }

    function genererRapportMensuel() {
        genererRapportPeriode(30, 'Rapport Mensuel', 'rapport-mensuel');
    }

    function genererRapportJournee(serieData) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF(); // Format A4 pour avoir de la place pour l'analyse
        const nom = currentTireur;
        const today = new Date().toLocaleDateString('fr-FR');
        const s = serieData || (db.eleves[nom] || [])[0]; // unshift = plus récent en index 0

        if (!s) {
            showToast('Aucune série à exporter.', 'error');
            return;
        }

        const max = (s.disc === 'FU' || s.disc === 'PCH' || s.disc === 'CS') ? 25 : 75;
        const pct = Math.round(parseInt(s.score) / max * 100);
        const nbRates = s.grille ? s.grille.filter(v => v === 0).length : 0;

        // ========== HEADER ==========
        doc.setFillColor(PDF_COLORS.DARKER_NAVY);
        doc.rect(0, 0, 210, 28, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('BALL-TRAP MASTER PRO', 105, 12, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Rapport de Séance', 105, 20, { align: 'center' });

        // ========== NOM ÉLÈVE ==========
        let y = 40;
        doc.setTextColor(PDF_COLORS.TEXT_DARK);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(nom.toUpperCase(), 14, y);
        
        doc.setTextColor(PDF_COLORS.TEXT_LIGHT);
        doc.setFontSize(10);
        doc.text(`${s.date} — ${s.disc}`, 196, y, { align: 'right' });

        // Ligne orange
        doc.setDrawColor(PDF_COLORS.ACCENT);
        doc.setLineWidth(1.5);
        doc.line(14, y + 5, 196, y + 5);

        // ========== SCORE ET GRILLE CÔTE À CÔTE ==========
        y = 55;
        
        // Score encadré à gauche
        doc.setFillColor(PDF_COLORS.SOFT_GRAY);
        doc.roundedRect(14, y, 60, 45, 3, 3, 'F');
        doc.setTextColor(PDF_COLORS.ACCENT);
        doc.setFontSize(32);
        doc.setFont('helvetica', 'bold');
        doc.text(`${s.score}/${max}`, 44, y + 22, { align: 'center' });
        doc.setTextColor(PDF_COLORS.TEXT_DARK);
        doc.setFontSize(14);
        doc.text(`${pct}%`, 44, y + 35, { align: 'center' });
        
        // Niveau coloré
        const niveau = pct >= 80 ? 'EXCELLENT' : pct >= 70 ? 'BON' : pct >= 60 ? 'CORRECT' : 'À AMÉLIORER';
        const niveauColor = pct >= 80 ? PDF_COLORS.GREEN : pct >= 70 ? PDF_COLORS.GREEN_LIGHT : pct >= 60 ? PDF_COLORS.ORANGE : PDF_COLORS.RED;
        doc.setTextColor(niveauColor);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(niveau, 44, y + 43, { align: 'center' });

        // Grille visuelle à droite
        if (s.grille && s.grille.length === 25) {
            const cellSize = 10;
            const startX = 100;
            const colors = { 1: [39, 174, 96], 2: [243, 156, 18], 0: [231, 76, 60] };
            
            doc.setTextColor(PDF_COLORS.TEXT_LIGHT);
            doc.setFontSize(8);
            doc.text('Grille de tir', startX, y - 3);
            
            for (let i = 0; i < 25; i++) {
                const row = Math.floor(i / 5);
                const col = i % 5;
                const x = startX + col * cellSize;
                const yPos = y + row * cellSize;
                const val = s.grille[i];
                
                doc.setFillColor(...colors[val]);
                doc.circle(x + cellSize/2, yPos + cellSize/2, 4, 'F');
            }
            
            // Légende
            doc.setFontSize(7);
            doc.setTextColor(PDF_COLORS.TEXT_LIGHT);
            doc.text('Légende:', startX, y + 55);
            doc.setFillColor(39, 174, 96); doc.circle(startX + 20, y + 53, 3, 'F');
            doc.text('Touché', startX + 25, y + 55);
            doc.setFillColor(243, 156, 18); doc.circle(startX + 50, y + 53, 3, 'F');
            doc.text('Râteau', startX + 55, y + 55);
            doc.setFillColor(231, 76, 60); doc.circle(startX + 80, y + 53, 3, 'F');
            doc.text('Raté', startX + 85, y + 55);
        }

        // ========== CONDITIONS ==========
        y = 110;
        doc.setTextColor(PDF_COLORS.ACCENT);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('CONDITIONS', 14, y);
        
        y += 5;
        doc.setFillColor(PDF_COLORS.SOFT_GRAY);
        doc.roundedRect(14, y, 182, 18, 3, 3, 'F');
        doc.setTextColor(PDF_COLORS.TEXT_DARK);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        
        let conditions = `Discipline: ${s.disc}`;
        if (s.poste) conditions += `  |  Poste depart: P${s.poste}`;
        if (s.vent) conditions += `  |  Vent: ${s.vent}`;
        if (s.meteoAPI) conditions += `  |  ${s.meteoAPI.temp}C - ${stripEmojis(s.meteoAPI.desc || '')}`;
        if (s.meteo && s.meteo !== 'soleil') conditions += `  |  Meteo: ${s.meteo}`;
        doc.text(stripEmojis(conditions), 18, y + 11);

        // ========== ANALYSE DE LA SÉRIE ==========
        y += 30;
        doc.setTextColor(PDF_COLORS.ACCENT);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('ANALYSE DE LA SÉRIE', 14, y);

        y += 5;
        
        // Analyse automatique si grille disponible
        if (s.grille && s.grille.length === 25) {
            // Stats par période
            const debut = s.grille.slice(0, 8);
            const milieu = s.grille.slice(8, 17);
            const fin = s.grille.slice(17, 25);
            
            const pctDebut = Math.round(debut.filter(v => v > 0).length / 8 * 100);
            const pctMilieu = Math.round(milieu.filter(v => v > 0).length / 9 * 100);
            const pctFin = Math.round(fin.filter(v => v > 0).length / 8 * 100);
            
            // Stats par poste
            const postesHits = [0,0,0,0,0];
            const postesTotal = [0,0,0,0,0];
            s.grille.forEach((val, i) => {
                const posteReel = calculerPoste(i + 1, s.disc, s.poste);
                if (posteReel >= 1 && posteReel <= 5) {
                    postesTotal[posteReel - 1]++;
                    if (val > 0) postesHits[posteReel - 1]++;
                }
            });
            const postesPct = postesTotal.map((t, i) => t > 0 ? Math.round(postesHits[i] / t * 100) : -1);
            const postesValid = postesPct.filter(p => p >= 0);
            const posteFort = postesValid.length ? postesPct.indexOf(Math.max(...postesValid)) + 1 : 0;
            const posteFaible = postesValid.length ? postesPct.indexOf(Math.min(...postesValid)) + 1 : 0;

            // Tableau des stats
            const statsData = [
                ['Début (1-8)', 'Milieu (9-17)', 'Fin (18-25)'],
                [`${pctDebut}%`, `${pctMilieu}%`, `${pctFin}%`]
            ];
            
            doc.autoTable({
                startY: y,
                head: [statsData[0]],
                body: [statsData[1]],
                theme: 'grid',
                headStyles: { fillColor: PDF_COLORS.DARK_NAVY, textColor: 255, fontStyle: 'bold', fontSize: 9 },
                bodyStyles: { fontSize: 10, fontStyle: 'bold' },
                columnStyles: { 
                    0: { cellWidth: 58, halign: 'center', textColor: pctDebut >= 70 ? [39,174,96] : [231,76,60] },
                    1: { cellWidth: 58, halign: 'center', textColor: pctMilieu >= 70 ? [39,174,96] : [231,76,60] },
                    2: { cellWidth: 58, halign: 'center', textColor: pctFin >= 70 ? [39,174,96] : [231,76,60] }
                },
                margin: { left: 14, right: 14 }
            });
            
            y = doc.lastAutoTable.finalY + 10;
            
            // Poste fort / faible (synthèse concise)
            doc.setTextColor(PDF_COLORS.TEXT_DARK);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            var synthesePoste;
            if (posteFort === 0) {
                synthesePoste = 'Données par poste non disponibles pour cette série.';
            } else if (postesPct[posteFort-1] === 100 && postesPct[posteFaible-1] === 100) {
                synthesePoste = 'Parfait sur tous les postes (100% de réussite sur l\'ensemble des positions).';
            } else {
                synthesePoste = `Poste fort: P${posteFort} (${postesPct[posteFort-1]}%).  Poste a travailler: P${posteFaible} (${postesPct[posteFaible-1]}%).`;
            }
            const lines = doc.splitTextToSize(synthesePoste, 182);
            y = pdfAddSectionWithPageBreak(doc, y, lines.length * 5 + 5, 20);
            doc.text(lines, 14, y);
            y += lines.length * 5 + 5;
        }

        // ========== ANALYSE COACH (auto-générée si absente du cache) ==========
        const analyseFineSerie = ensureAnalyseSerie(s);
        if (analyseFineSerie) {
            y = pdfAddSectionWithPageBreak(doc, y, 20, 20);
            doc.setTextColor(PDF_COLORS.ACCENT);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('ANALYSE COACH', 14, y);
            y += 6;
            doc.setTextColor(PDF_COLORS.TEXT_DARK);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            const paragraphes = stripEmojis(analyseFineSerie)
                .replace(/►/g, '>').replace(/●/g, '-')
                .split(/\\n|\n/);
            paragraphes.forEach(para => {
                if (!para.trim()) { y += 3; return; }
                const paraLines = doc.splitTextToSize(para.trim(), 178);
                paraLines.forEach(line => {
                    y = pdfAddSectionWithPageBreak(doc, y, 6, 20);
                    doc.text(line, 16, y);
                    y += 5;
                });
            });
            y += 3;
        }
        // ========== LE MOT DE LA FIN (Coach) ==========
        y = pdfAddSectionWithPageBreak(doc, y, 30, 20);
        doc.setTextColor(PDF_COLORS.ACCENT);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('LE MOT DE LA FIN', 14, y);
        
        y += 6;
        /* Sépare la météo préfixée de la vraie note du coach */
        const noteComplete = s.note || '';
        const noteStrippedCoach = stripEmojis(noteComplete);
        let noteCoach = noteStrippedCoach
            .replace(/\[[^\]]*°[^\]]*\]/g, '')
            .replace(/\[\s*[Vv]ent[^\]]*\]/gi, '')
            .replace(/\[\s*\]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
            
        // 🪄 LA MAGIE : Le petit mot automatique si le coach n'a rien écrit
        if (!noteCoach || noteCoach === '') {
            const motsMagiques = [
                "Excellente implication aujourd'hui. Chaque plateau tiré est une leçon apprise. Garde cette belle dynamique !",
                "La progression passe par la régularité. Un très bon état d'esprit sur le pas de tir, continue tes efforts !",
                "La confiance se construit pas à pas. Reste concentré sur tes objectifs, le travail finit toujours par payer.",
                "Une séance riche en enseignements. Garde cette superbe énergie pour notre prochain entraînement !",
                "Ton écoute et ta concentration font plaisir à voir. Les fondations sont solides, on lâche rien !"
            ];
            noteCoach = motsMagiques[Math.floor(Math.random() * motsMagiques.length)];
        }

        const noteLines = doc.splitTextToSize(noteCoach, 175);
        const noteH = Math.max(16, noteLines.length * 5 + 10);
        y = pdfAddSectionWithPageBreak(doc, y, noteH + 5, 20);
        
        // Design chaleureux : fond légèrement teinté et texte en italique
        doc.setFillColor(255, 248, 225); // Un jaune très pâle et chaleureux
        doc.roundedRect(14, y, 182, noteH, 3, 3, 'F');
        doc.setTextColor(PDF_COLORS.TEXT_DARK);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic'); 
        doc.text(noteLines, 18, y + 8);
        y += noteH + 8;

        // ========== RECOMMANDATIONS ==========
        y = pdfAddSectionWithPageBreak(doc, y, 45, 20);
        doc.setTextColor(PDF_COLORS.ACCENT);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('RECOMMANDATIONS', 14, y);
        
        y += 5;
        
        // Générer recommandations auto
        let reco = '';
        if (s.grille && s.grille.length === 25) {
            const fin = s.grille.slice(17, 25);
            const debut = s.grille.slice(0, 8);
            const pctFin = Math.round(fin.filter(v => v > 0).length / 8 * 100);
            const pctDebut = Math.round(debut.filter(v => v > 0).length / 8 * 100);
            if (pctFin < pctDebut - 20) {
                reco = 'Travaille l\'endurance mentale et le maintien de la concentration sur la dur\u00e9e.';
            } else if (pct < 60) {
                reco = 'Revois les fondamentaux : position, montage, l\u00e2cher. Pr\u00e9vois des exercices cibl\u00e9s.';
            } else if (pct >= 80 && nbRates === 0) {
                reco = 'S\u00e9rie parfaite ! Confirme cette ma\u00eetrise en conditions de comp\u00e9tition.';
            } else if (pct >= 80) {
                const ratésDir = s.directions || [];
                const ratésGauche = ratésDir.filter((d,i) => s.grille[i] === 0 && (d === 'G' || d === 'dG')).length;
                const ratésDroite = ratésDir.filter((d,i) => s.grille[i] === 0 && (d === 'D' || d === 'dD')).length;
                if (ratésGauche > 0 && ratésDroite === 0) {
                    reco = 'Bonne s\u00e9ance. Axe de travail : les trajectoires \u00e0 gauche, r\u00e9currentes sur cette s\u00e9rie.';
                } else if (ratésDroite > 0 && ratésGauche === 0) {
                    reco = 'Bonne s\u00e9ance. Axe de travail : les trajectoires \u00e0 droite, r\u00e9currentes sur cette s\u00e9rie.';
                } else {
                    reco = 'Bonne s\u00e9ance. Les quelques rat\u00e9s sont isol\u00e9s, pas de d\u00e9faut technique flagrant.';
                }
            } else {
                reco = 'Progression encourageante. Continue les exercices sur les points faibles identifi\u00e9s.';
            }
        } else {
            reco = 'Continue l\'entra\u00eenement r\u00e9gulier pour progresser.';
        }
        
        y = pdfAddSectionWithPageBreak(doc, y, 25, 20);
        const recoLines = doc.splitTextToSize('> ' + stripEmojis(reco).replace(/►/g,'>'), 174);
        const recoH = Math.max(18, recoLines.length * 5 + 8);
        doc.setFillColor(233, 245, 233);
        doc.roundedRect(14, y, 182, recoH, 3, 3, 'F');
        doc.setTextColor(PDF_COLORS.GREEN);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(recoLines[0], 18, y + 9);
        if (recoLines.length > 1) {
            doc.setTextColor(PDF_COLORS.TEXT_DARK);
            doc.setFont('helvetica', 'normal');
            doc.text(recoLines.slice(1), 18, y + 14);
        }
        y += recoH + 8;

        // ========== FOOTER sur toutes les pages ==========
        // NOTE: Pas de BILAN COACH global ici — le PDF série ne parle QUE de cette série.
        // Le bilan multi-séries (ensureAnalyseGlobale) est réservé aux PDF semaine/mensuel.
        pdfFooter(doc, today);
        doc.save(`rapport-seance-${nom.replace(/\s+/g, '-')}-${s.date.replace(/\//g, '-')}.pdf`);
    }
    

    /* =========================================================
       PWA — SERVICE WORKER INLINE (Blob URL)
    ========================================================= */
    const SW_CODE = `
const CACHE = 'balltrap-masterpro-v1.3';
const SHELL = [location.href, './style.css', './timelock.js', './app.js', './bpdev-logo.svg'];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.match(e.request).then(cached => {
            const network = fetch(e.request).then(res => {
                if (res && res.status === 200) {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                }
                return res;
            }).catch(() => null);
            return cached || network || caches.match(SHELL[0]);
        })
    );
});

self.addEventListener('message', e => {
    if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
`;

    const MANIFEST = {
        name: 'Ball-Trap Master Pro',
        short_name: 'Ball-Trap',
        description: 'Coaching ball-trap — scores, élèves, bilans.',
        start_url: location.href,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#e0e5ec',
        theme_color: '#f39c12',
        lang: 'fr',
        icons: [
            { src: _genIcon(192), sizes: '192x192', type: 'image/png' },
            { src: _genIcon(512), sizes: '512x512', type: 'image/png' }
        ]
    };

    function _genIcon(size) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        const s = size;
        // Fond arrondi neumorphique
        ctx.fillStyle = '#e0e5ec';
        const r = s / 5;
        ctx.beginPath();
        ctx.moveTo(r, 0); ctx.lineTo(s - r, 0);
        ctx.quadraticCurveTo(s, 0, s, r);
        ctx.lineTo(s, s - r); ctx.quadraticCurveTo(s, s, s - r, s);
        ctx.lineTo(r, s); ctx.quadraticCurveTo(0, s, 0, s - r);
        ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.closePath(); ctx.fill();
        // 3 cercles concentriques — cible ball-trap
        const cx = s / 2, cy = s / 2;
        const rings = [
            { color: '#f39c12', r: 0.40 },  // Cercle extérieur (orange)
            { color: '#e0e5ec', r: 0.30 },  // Anneau clair
            { color: '#f39c12', r: 0.20 },  // Cercle moyen (orange)
            { color: '#e0e5ec', r: 0.11 },  // Anneau clair
            { color: '#f39c12', r: 0.05 }   // Centre (point orange)
        ];
        rings.forEach(({ color, r: rf }) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(cx, cy, s * rf, 0, Math.PI * 2);
            ctx.fill();
        });
        return c.toDataURL('image/png');
    }

    document.getElementById('pwa-manifest').href =
        'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(MANIFEST));

    if ('serviceWorker' in navigator) {
        const blob = new Blob([SW_CODE], { type: 'application/javascript' });
        const swUrl = URL.createObjectURL(blob);

        window.addEventListener('load', () => {
            navigator.serviceWorker.register(swUrl)
                .then(reg => {
                    reg.addEventListener('updatefound', () => {
                        const nw = reg.installing;
                        nw.addEventListener('statechange', () => {
                            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                                afficherBanniereMAJ(nw);
                            }
                        });
                    });
                })
                .catch(err => console.info('SW non dispo dans cet environnement :', err.message));

            navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
            });
        });
    }

    function afficherBanniereMAJ(worker) {
        const banner = document.createElement('div');
        banner.style.cssText = [
            'position:fixed', 'bottom:90px', 'left:50%', 'transform:translateX(-50%)',
            'background:var(--bg)', 'border-radius:16px', 'padding:12px 18px',
            'box-shadow:var(--neu-out-md)', 'z-index:99998',
            'display:flex', 'align-items:center', 'gap:12px',
            'font-size:0.85rem', 'font-weight:700', 'color:var(--text-primary)',
            'white-space:nowrap'
        ].join(';');
        const span = document.createElement('span');
        span.textContent = '🔄 Mise à jour disponible';
        const btn = document.createElement('button');
        btn.textContent = 'INSTALLER';
        btn.style.cssText = 'background:var(--accent);color:white;border:none;border-radius:10px;padding:6px 14px;font-weight:700;cursor:pointer;font-size:0.8rem;';
        btn.onclick = () => { worker.postMessage({ type: 'SKIP_WAITING' }); banner.remove(); };
        banner.append(span, btn);
        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 10000);
    }
