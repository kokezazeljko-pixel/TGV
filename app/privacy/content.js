// Privacy policy text in English, German, French and Dutch.
// Each section: h (heading), p (paragraphs before the list), list, after (paragraphs after the list).
// Placeholders: {site} = site name, {email} = contact email.

export const PRIVACY = {
  en: {
    title: "Privacy policy",
    updated: "Last updated",
    intro: "{site} shows how late trains in France, Switzerland, Belgium, the Netherlands, Luxembourg and Spain are and lets passengers share what is happening on board. This page explains what personal data the site handles, why, and what your rights are under the EU General Data Protection Regulation (GDPR) and the Swiss Federal Act on Data Protection (FADP).",
    sections: [
      { h: "Who is responsible", p: ["The site is run by the operator of {site}, who is the data controller. You can reach the operator at {email} for any question about your data."] },
      {
        h: "What we collect",
        list: [
          "Your email address, only if you sign in. It is used to sign you in (with a link, a password you choose, or Google) and to keep you signed in. It is never shown to other visitors. Passwords are stored only in encrypted (hashed) form by Supabase; we never see them. If you sign in with Google, Google also tells us your name and profile photo; they are shown only if you choose them in “My account”.",
          "The display name you choose. It is shown next to your comments unless you post anonymously.",
          "Optional profile details you add in “My account”: a profile picture (resized to a small square in your browser, so no camera or location data is uploaded), first and last name, a short text about you, your favourite station, home country and favourite train. Other visitors see only the picture next to your comments, and your first and last name only if you turn on “show my name”; the rest is visible only to you. You can change or remove them at any time.",
          "Your comments: the text, the reason or rating you pick, whether you marked yourself as on board, the train and the time of posting.",
          "Technical data needed to run the site, such as your IP address and browser type, which our hosting providers keep in their server logs for a short time.",
          "Your language and country choice and, if you sign in, your session. These are stored in your own browser.",
        ],
        after: ["You can read train delays without signing in. In that case we do not collect any personal data beyond the technical server logs."],
      },
      { h: "What we do not do", list: ["We do not sell or rent your data.", "We do not show ads.", "We do not use tracking or advertising cookies, and we do not use analytics tools that follow you across sites."] },
      {
        h: "Why we use your data (legal basis)",
        list: [
          "To give you an account and publish your comments: this is necessary to provide the service you asked for (GDPR article 6(1)(b)).",
          "To keep the site secure and prevent spam and abuse, using server logs and posting limits: our legitimate interest (article 6(1)(f)).",
        ],
      },
      {
        h: "Who processes the data for us",
        p: ["We use trusted providers that process data on our behalf:"],
        list: [
          "Supabase: database and sign-in. Data is stored in the European Union (Frankfurt, Germany).",
          "Vercel: hosting of the website. Vercel may process technical data, such as IP addresses, outside the EU under the European Commission's standard contractual clauses.",
          "Vercel Web Analytics: counts page visits so we know how many people use the site (pages viewed, country, device type, the site you came from). It uses no cookies, does not store your IP address and does not build a profile of you; we only see totals.",
          "GitHub: runs the scripts that fetch train data from SNCF, opentransportdata.swiss, SNCB, OVapi (Netherlands) and data.public.lu (Luxembourg). These scripts do not handle any visitor data.",
          "Ko-fi: donations and payments for access to earlier days. Ko-fi (with PayPal or Stripe) handles the payment; we only receive the email address, the amount and a transaction number, and use them to unlock access for the account with that email.",
        ],
      },
      {
        h: "Train data",
        p: ["Timetables and real-time delays come from SNCF open data (transport.data.gouv.fr), for Switzerland from opentransportdata.swiss for Belgium from SNCB open data (data.belgianmobility.io) for the Netherlands from NS / NDOV open data via OVapi (gtfs.ovapi.nl) and for Luxembourg from the open data of the Administration des transports publics (data.public.lu, mobiliteit.lu), for Spain from Renfe open data (data.renfe.com). They contain no personal data."],
      },
      {
        h: "How long we keep data",
        list: [
          "Your account and display name: until you ask us to delete them.",
          "Your comments: until you delete them yourself (use “Delete” next to your comment) or delete your account.",
          "Server logs: kept by our hosting providers for a limited time, usually a few days to a few weeks.",
        ],
      },
      {
        h: "Your rights",
        p: ["Under the GDPR you can ask to access your data, correct it, delete it, receive a copy of it, or object to how we use it. Write to {email} and we will answer within one month. You can also delete any of your comments yourself at any time."],
        list2h: "If you are not satisfied",
        list2: "You can file a complaint with a data protection authority, for example the Federal Data Protection and Information Commissioner in Switzerland (www.edoeb.admin.ch), the CNIL in France (www.cnil.fr), the Data Protection Authority in Belgium (www.dataprotectionauthority.be) or the authority in your own country.",
      },
      { h: "Children", p: ["The site is not intended for children under 15. Do not create an account if you are under 15."] },
      { h: "Changes to this policy", p: ["If we change how we handle data, we will update this page and the date at the top."] },
    ],
  },
  de: {
    title: "Datenschutzerklärung",
    updated: "Zuletzt aktualisiert",
    intro: "{site} zeigt, wie verspätet Züge in Frankreich, der Schweiz, Belgien, den Niederlanden, Luxemburg und Spanien sind, und lässt Reisende teilen, was an Bord passiert. Diese Seite erklärt, welche personenbezogenen Daten die Website verarbeitet, warum, und welche Rechte Sie nach der EU-Datenschutz-Grundverordnung (DSGVO) und dem Schweizer Datenschutzgesetz (DSG) haben.",
    sections: [
      { h: "Verantwortlicher", p: ["Die Website wird vom Betreiber von {site} betrieben, der für die Datenverarbeitung verantwortlich ist. Bei Fragen zu Ihren Daten erreichen Sie den Betreiber unter {email}."] },
      {
        h: "Welche Daten wir erheben",
        list: [
          "Ihre E-Mail-Adresse, nur wenn Sie sich anmelden. Sie dient der Anmeldung (per Link, mit einem selbst gewählten Passwort oder mit Google) und dazu, Sie angemeldet zu halten. Sie wird anderen Besuchern nie angezeigt. Passwörter speichert Supabase nur verschlüsselt (gehasht); wir sehen sie nie. Bei der Anmeldung mit Google erhalten wir von Google auch Ihren Namen und Ihr Profilfoto; diese werden nur angezeigt, wenn Sie sie unter „Mein Konto“ wählen.",
          "Den Anzeigenamen, den Sie wählen. Er erscheint neben Ihren Kommentaren, außer Sie posten anonym.",
          "Freiwillige Profilangaben unter „Mein Konto“: ein Profilbild (im Browser auf ein kleines Quadrat verkleinert, ohne Kamera- oder Standortdaten), Vor- und Nachname, ein kurzer Text über Sie, Lieblingsbahnhof, Heimatland und Lieblingszug. Andere Besucher sehen bei Ihren Kommentaren nur das Bild und Vor- und Nachnamen nur, wenn Sie „Namen zeigen“ einschalten; der Rest ist nur für Sie sichtbar. Sie können alles jederzeit ändern oder löschen.",
          "Ihre Kommentare: den Text, den gewählten Grund oder die Bewertung, ob Sie sich als „an Bord“ markiert haben, den Zug und den Zeitpunkt.",
          "Technische Daten, die für den Betrieb nötig sind, etwa IP-Adresse und Browsertyp, die unsere Hosting-Anbieter kurzzeitig in ihren Server-Logs speichern.",
          "Ihre Sprachwahl, Ihre Länderwahl und, wenn Sie angemeldet sind, Ihre Sitzung. Diese werden in Ihrem eigenen Browser gespeichert.",
        ],
        after: ["Sie können Verspätungen ohne Anmeldung ansehen. In diesem Fall erheben wir außer den technischen Server-Logs keine personenbezogenen Daten."],
      },
      { h: "Was wir nicht tun", list: ["Wir verkaufen oder vermieten Ihre Daten nicht.", "Wir zeigen keine Werbung.", "Wir verwenden keine Tracking- oder Werbe-Cookies und keine Analyse-Tools, die Sie über Websites hinweg verfolgen."] },
      {
        h: "Wozu wir Ihre Daten verwenden (Rechtsgrundlage)",
        list: [
          "Um Ihnen ein Konto zu geben und Ihre Kommentare zu veröffentlichen: zur Erbringung des von Ihnen gewünschten Dienstes erforderlich (Art. 6 Abs. 1 lit. b DSGVO).",
          "Um die Website zu schützen und Spam und Missbrauch zu verhindern, mithilfe von Server-Logs und Posting-Limits: unser berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO).",
        ],
      },
      {
        h: "Wer Daten für uns verarbeitet",
        p: ["Wir nutzen vertrauenswürdige Anbieter, die Daten in unserem Auftrag verarbeiten:"],
        list: [
          "Supabase: Datenbank und Anmeldung. Die Daten werden in der Europäischen Union gespeichert (Frankfurt, Deutschland).",
          "Vercel: Hosting der Website. Vercel kann technische Daten wie IP-Adressen auf Grundlage der Standardvertragsklauseln der Europäischen Kommission außerhalb der EU verarbeiten.",
          "Vercel Web Analytics: zählt Seitenaufrufe, damit wir wissen, wie viele Menschen die Website nutzen (besuchte Seiten, Land, Gerätetyp, vorherige Website). Es verwendet keine Cookies, speichert Ihre IP-Adresse nicht und erstellt kein Profil von Ihnen; wir sehen nur Gesamtzahlen.",
          "GitHub: führt die Skripte aus, die Zugdaten von SNCF, opentransportdata.swiss, SNCB, OVapi (Niederlande) und data.public.lu (Luxemburg) abrufen. Diese Skripte verarbeiten keine Besucherdaten.",
          "Ko-fi: Spenden und Zahlungen für den Zugang zu früheren Tagen. Ko-fi (mit PayPal oder Stripe) wickelt die Zahlung ab; wir erhalten nur die E-Mail-Adresse, den Betrag und eine Transaktionsnummer und nutzen sie, um den Zugang für das Konto mit dieser E-Mail freizuschalten.",
        ],
      },
      { h: "Zugdaten", p: ["Fahrpläne und Echtzeit-Verspätungen stammen aus den Open Data der SNCF (transport.data.gouv.fr), für die Schweiz von opentransportdata.swiss für Belgien aus den Open Data der SNCB (data.belgianmobility.io) für die Niederlande aus den Open Data von NS / NDOV über OVapi (gtfs.ovapi.nl) und für Luxemburg aus den Open Data der Administration des transports publics (data.public.lu, mobiliteit.lu), für Spanien aus den Open Data von Renfe (data.renfe.com). Sie enthalten keine personenbezogenen Daten."] },
      {
        h: "Wie lange wir Daten speichern",
        list: [
          "Ihr Konto und Ihr Anzeigename: bis Sie die Löschung verlangen.",
          "Ihre Kommentare: bis Sie sie selbst löschen (mit „Löschen“ neben dem Kommentar) oder Ihr Konto gelöscht wird.",
          "Server-Logs: von unseren Hosting-Anbietern für begrenzte Zeit gespeichert, meist einige Tage bis wenige Wochen.",
        ],
      },
      {
        h: "Ihre Rechte",
        p: ["Sie können Auskunft über Ihre Daten verlangen, sie berichtigen oder löschen lassen, eine Kopie erhalten oder der Verarbeitung widersprechen. Schreiben Sie an {email}, wir antworten innerhalb eines Monats. Ihre Kommentare können Sie jederzeit selbst löschen."],
        list2h: "Wenn Sie nicht zufrieden sind",
        list2: "Sie können sich bei einer Datenschutzbehörde beschweren, zum Beispiel beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten in der Schweiz (www.edoeb.admin.ch), bei der CNIL in Frankreich (www.cnil.fr), bei der Datenschutzbehörde in Belgien (www.dataprotectionauthority.be) oder bei der Behörde in Ihrem Land.",
      },
      { h: "Kinder", p: ["Die Website richtet sich nicht an Kinder unter 15 Jahren. Erstellen Sie kein Konto, wenn Sie jünger als 15 sind."] },
      { h: "Änderungen", p: ["Wenn wir den Umgang mit Daten ändern, aktualisieren wir diese Seite und das Datum oben."] },
    ],
  },
  fr: {
    title: "Politique de confidentialité",
    updated: "Dernière mise à jour",
    intro: "{site} indique les retards des trains en France, en Suisse, en Belgique, aux Pays-Bas, au Luxembourg et en Espagne et permet aux voyageurs de partager ce qui se passe à bord. Cette page explique quelles données personnelles le site traite, pourquoi, et quels sont vos droits selon le Règlement général sur la protection des données (RGPD) et la loi suisse sur la protection des données (LPD).",
    sections: [
      { h: "Responsable du traitement", p: ["Le site est géré par l’exploitant de {site}, responsable du traitement. Vous pouvez le contacter à {email} pour toute question sur vos données."] },
      {
        h: "Données collectées",
        list: [
          "Votre adresse e-mail, uniquement si vous vous connectez. Elle sert à vous connecter (par lien, avec un mot de passe que vous choisissez ou avec Google) et à garder votre session ouverte. Elle n’est jamais affichée aux autres visiteurs. Les mots de passe sont conservés par Supabase uniquement sous forme chiffrée (hachée) ; nous ne les voyons jamais. Avec Google, Google nous transmet aussi votre nom et votre photo de profil ; ils ne sont affichés que si vous les choisissez dans « Mon compte ».",
          "Le nom d’affichage que vous choisissez. Il apparaît à côté de vos commentaires, sauf si vous publiez anonymement.",
          "Les informations facultatives ajoutées dans « Mon compte » : une photo de profil (réduite en petit carré dans votre navigateur, sans données d’appareil photo ni de localisation), prénom et nom, un court texte, votre gare préférée, votre pays et votre train préféré. Les autres visiteurs ne voient que la photo à côté de vos commentaires, et vos prénom et nom seulement si vous activez « afficher mon nom » ; le reste n’est visible que par vous. Vous pouvez les modifier ou les supprimer à tout moment.",
          "Vos commentaires : le texte, le motif ou la note choisis, l’indication « à bord », le train et l’heure de publication.",
          "Les données techniques nécessaires au fonctionnement du site, comme l’adresse IP et le type de navigateur, conservées brièvement par nos hébergeurs dans leurs journaux.",
          "Votre choix de langue et de pays et, si vous êtes connecté, votre session. Ils sont enregistrés dans votre propre navigateur.",
        ],
        after: ["Vous pouvez consulter les retards sans vous connecter. Dans ce cas, aucune donnée personnelle n’est collectée en dehors des journaux techniques."],
      },
      { h: "Ce que nous ne faisons pas", list: ["Nous ne vendons ni ne louons vos données.", "Nous n’affichons pas de publicité.", "Nous n’utilisons pas de cookies de suivi ou publicitaires, ni d’outils d’analyse qui vous suivent d’un site à l’autre."] },
      {
        h: "Pourquoi nous utilisons vos données (base légale)",
        list: [
          "Pour gérer votre compte et publier vos commentaires : nécessaire à la fourniture du service demandé (article 6(1)(b) du RGPD).",
          "Pour assurer la sécurité du site et éviter le spam, grâce aux journaux et aux limites de publication : notre intérêt légitime (article 6(1)(f)).",
        ],
      },
      {
        h: "Sous-traitants",
        p: ["Nous faisons appel à des prestataires de confiance qui traitent des données pour notre compte :"],
        list: [
          "Supabase : base de données et connexion. Les données sont stockées dans l’Union européenne (Francfort, Allemagne).",
          "Vercel : hébergement du site. Vercel peut traiter des données techniques, comme les adresses IP, hors de l’UE, sous couvert des clauses contractuelles types de la Commission européenne.",
          "Vercel Web Analytics : compte les visites pour savoir combien de personnes utilisent le site (pages vues, pays, type d’appareil, site de provenance). Sans cookies, sans enregistrer votre adresse IP et sans créer de profil ; nous ne voyons que des totaux.",
          "GitHub : exécute les scripts qui récupèrent les données SNCF, opentransportdata.swiss, SNCB, OVapi (Pays-Bas) et data.public.lu (Luxembourg). Ces scripts ne traitent aucune donnée des visiteurs.",
          "Ko-fi : dons et paiements pour l’accès aux jours précédents. Ko-fi (avec PayPal ou Stripe) traite le paiement ; nous recevons uniquement l’adresse e-mail, le montant et un numéro de transaction, utilisés pour débloquer l’accès du compte ayant cet e-mail.",
        ],
      },
      { h: "Données ferroviaires", p: ["Les horaires et les retards en temps réel proviennent de l’open data SNCF (transport.data.gouv.fr), pour la Suisse d’opentransportdata.swiss pour la Belgique de l’open data SNCB (data.belgianmobility.io) pour les Pays-Bas de l’open data NS / NDOV via OVapi (gtfs.ovapi.nl) et pour le Luxembourg de l’open data de l’Administration des transports publics (data.public.lu, mobiliteit.lu), pour l’Espagne de l’open data Renfe (data.renfe.com). Ils ne contiennent aucune donnée personnelle."] },
      {
        h: "Durée de conservation",
        list: [
          "Votre compte et votre nom d’affichage : jusqu’à ce que vous demandiez leur suppression.",
          "Vos commentaires : jusqu’à ce que vous les supprimiez (bouton « Supprimer » à côté du commentaire) ou que votre compte soit supprimé.",
          "Journaux techniques : conservés pour une durée limitée par nos hébergeurs, en général de quelques jours à quelques semaines.",
        ],
      },
      {
        h: "Vos droits",
        p: ["Selon le RGPD, vous pouvez demander l’accès à vos données, leur rectification, leur effacement, leur portabilité, ou vous opposer à leur traitement. Écrivez à {email}, nous répondrons dans un délai d’un mois. Vous pouvez aussi supprimer vous-même vos commentaires à tout moment."],
        list2h: "En cas de désaccord",
        list2: "Vous pouvez introduire une réclamation auprès d’une autorité de protection des données, par exemple le Préposé fédéral à la protection des données et à la transparence en Suisse (www.edoeb.admin.ch), la CNIL en France (www.cnil.fr), l’Autorité de protection des données en Belgique (www.autoriteprotectiondonnees.be) ou l’autorité de votre pays.",
      },
      { h: "Mineurs", p: ["Le site ne s’adresse pas aux enfants de moins de 15 ans. Ne créez pas de compte si vous avez moins de 15 ans."] },
      { h: "Modifications", p: ["Si nous modifions la façon dont nous traitons les données, nous mettrons à jour cette page et la date indiquée en haut."] },
    ],
  },
  nl: {
    title: "Privacybeleid",
    updated: "Laatst bijgewerkt",
    intro: "{site} toont hoeveel vertraging treinen in Frankrijk, Zwitserland, België, Nederland, Luxemburg en Spanje hebben en laat reizigers delen wat er aan boord gebeurt. Deze pagina legt uit welke persoonsgegevens de site verwerkt, waarom, en welke rechten je hebt volgens de Algemene Verordening Gegevensbescherming (AVG) van de EU en de Zwitserse federale wet op de gegevensbescherming (DSG/FADP).",
    sections: [
      { h: "Wie is verantwoordelijk", p: ["De site wordt beheerd door de uitbater van {site}, die de verwerkingsverantwoordelijke is. Je kunt de uitbater bereiken via {email} voor elke vraag over je gegevens."] },
      {
        h: "Wat we verzamelen",
        list: [
          "Je e-mailadres, alleen als je je aanmeldt. Het wordt gebruikt om je aan te melden (met een link, een zelfgekozen wachtwoord of Google) en je aangemeld te houden. Het wordt nooit aan andere bezoekers getoond. Wachtwoorden bewaart Supabase alleen versleuteld (gehasht); wij zien ze nooit. Meld je je aan met Google, dan krijgen we van Google ook je naam en profielfoto; die worden alleen getoond als je ze kiest in „Mijn account”.",
          "De weergavenaam die je kiest. Die staat naast je reacties, tenzij je anoniem plaatst.",
          "Optionele profielgegevens in „Mijn account”: een profielfoto (in je browser verkleind tot een klein vierkant, zonder camera- of locatiegegevens), voor- en achternaam, een korte tekst over jezelf, je favoriete station, thuisland en favoriete trein. Andere bezoekers zien naast je reacties alleen de foto, en je voor- en achternaam alleen als je „mijn naam tonen” aanzet; de rest zie alleen jij. Je kunt alles op elk moment wijzigen of verwijderen.",
          "Je reacties: de tekst, de reden of score die je kiest, of je aangaf aan boord te zijn, de trein en het tijdstip van plaatsen.",
          "Technische gegevens die nodig zijn om de site te laten werken, zoals je IP-adres en browsertype, die onze hostingproviders korte tijd in hun serverlogs bewaren.",
          "Je keuze van taal en land en, als je aangemeld bent, je sessie. Die worden in je eigen browser opgeslagen.",
        ],
        after: ["Je kunt treinvertragingen bekijken zonder je aan te melden. Dan verzamelen we geen persoonsgegevens buiten de technische serverlogs."],
      },
      { h: "Wat we niet doen", list: ["We verkopen of verhuren je gegevens niet.", "We tonen geen advertenties.", "We gebruiken geen tracking- of advertentiecookies en geen analysetools die je over verschillende sites volgen."] },
      {
        h: "Waarom we je gegevens gebruiken (rechtsgrond)",
        list: [
          "Om je een account te geven en je reacties te publiceren: dit is nodig om de dienst te leveren waar je om vroeg (artikel 6, lid 1, b AVG).",
          "Om de site veilig te houden en spam en misbruik te voorkomen, met serverlogs en limieten op het plaatsen: ons gerechtvaardigd belang (artikel 6, lid 1, f).",
        ],
      },
      {
        h: "Wie de gegevens voor ons verwerkt",
        p: ["We werken met betrouwbare dienstverleners die gegevens in onze opdracht verwerken:"],
        list: [
          "Supabase: database en aanmelden. De gegevens worden in de Europese Unie opgeslagen (Frankfurt, Duitsland).",
          "Vercel: hosting van de website. Vercel kan technische gegevens, zoals IP-adressen, buiten de EU verwerken op basis van de standaardcontractbepalingen van de Europese Commissie.",
          "Vercel Web Analytics: telt paginabezoeken zodat we weten hoeveel mensen de site gebruiken (bekeken pagina's, land, soort toestel, de site waar je vandaan kwam). Het gebruikt geen cookies, bewaart je IP-adres niet en maakt geen profiel van je; we zien alleen totalen.",
          "GitHub: voert de scripts uit die treingegevens ophalen bij SNCF, opentransportdata.swiss, NMBS, OVapi (Nederland) en data.public.lu (Luxemburg). Die scripts verwerken geen gegevens van bezoekers.",
          "Ko-fi: giften en betalingen voor toegang tot eerdere dagen. Ko-fi (met PayPal of Stripe) verwerkt de betaling; wij ontvangen alleen het e-mailadres, het bedrag en een transactienummer, en gebruiken die om de toegang te ontgrendelen voor het account met dat e-mailadres.",
        ],
      },
      {
        h: "Treingegevens",
        p: ["Dienstregelingen en realtime vertragingen komen uit de open data van SNCF (transport.data.gouv.fr), voor Zwitserland van opentransportdata.swiss voor België uit de open data van de NMBS (data.belgianmobility.io) voor Nederland uit de open data van NS / NDOV via OVapi (gtfs.ovapi.nl) en voor Luxemburg uit de open data van de Administration des transports publics (data.public.lu, mobiliteit.lu), voor Spanje uit de open data van Renfe (data.renfe.com). Ze bevatten geen persoonsgegevens."],
      },
      {
        h: "Hoe lang we gegevens bewaren",
        list: [
          "Je account en weergavenaam: tot je ons vraagt ze te verwijderen.",
          "Je reacties: tot je ze zelf verwijdert (met “Verwijderen” naast je reactie) of je account verwijdert.",
          "Serverlogs: door onze hostingproviders beperkte tijd bewaard, meestal enkele dagen tot enkele weken.",
        ],
      },
      {
        h: "Je rechten",
        p: ["Volgens de AVG kun je vragen om je gegevens in te zien, te verbeteren, te verwijderen, een kopie te krijgen of bezwaar te maken tegen hoe we ze gebruiken. Schrijf naar {email} en we antwoorden binnen een maand. Je kunt ook op elk moment zelf je reacties verwijderen."],
        list2h: "Als je niet tevreden bent",
        list2: "Je kunt een klacht indienen bij een gegevensbeschermingsautoriteit, bijvoorbeeld de Gegevensbeschermingsautoriteit in België (www.gegevensbeschermingsautoriteit.be), de federale functionaris voor gegevensbescherming in Zwitserland (www.edoeb.admin.ch), de CNIL in Frankrijk (www.cnil.fr) of de autoriteit in je eigen land.",
      },
      { h: "Kinderen", p: ["De site is niet bedoeld voor kinderen jonger dan 15 jaar. Maak geen account aan als je jonger bent dan 15."] },
      { h: "Wijzigingen", p: ["Als we veranderen hoe we met gegevens omgaan, passen we deze pagina en de datum bovenaan aan."] },
    ],
  },
};
