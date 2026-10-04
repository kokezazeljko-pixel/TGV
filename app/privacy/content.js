// Privacy policy text in English, German and French.
// Each section: h (heading), p (paragraphs before the list), list, after (paragraphs after the list).
// Placeholders: {site} = site name, {email} = contact email.

export const PRIVACY = {
  en: {
    title: "Privacy policy",
    updated: "Last updated",
    intro: "{site} shows how late trains in France and Switzerland are and lets passengers share what is happening on board. This page explains what personal data the site handles, why, and what your rights are under the EU General Data Protection Regulation (GDPR) and the Swiss Federal Act on Data Protection (FADP).",
    sections: [
      { h: "Who is responsible", p: ["The site is run by the operator of {site}, who is the data controller. You can reach the operator at {email} for any question about your data."] },
      {
        h: "What we collect",
        list: [
          "Your email address, only if you sign in. It is used to send you a sign-in link and to keep you signed in. It is never shown to other visitors.",
          "The display name you choose. It is shown next to your comments unless you post anonymously.",
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
          "GitHub: runs the scripts that fetch train data from SNCF and opentransportdata.swiss. These scripts do not handle any visitor data.",
        ],
      },
      {
        h: "Train data",
        p: ["Timetables and real-time delays come from SNCF open data (transport.data.gouv.fr) and, for Switzerland, from opentransportdata.swiss. They contain no personal data."],
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
        list2: "You can file a complaint with a data protection authority, for example the Federal Data Protection and Information Commissioner in Switzerland (www.edoeb.admin.ch), the CNIL in France (www.cnil.fr) or the authority in your own country.",
      },
      { h: "Children", p: ["The site is not intended for children under 15. Do not create an account if you are under 15."] },
      { h: "Changes to this policy", p: ["If we change how we handle data, we will update this page and the date at the top."] },
    ],
  },
  de: {
    title: "Datenschutzerklärung",
    updated: "Zuletzt aktualisiert",
    intro: "{site} zeigt, wie verspätet Züge in Frankreich und der Schweiz sind, und lässt Reisende teilen, was an Bord passiert. Diese Seite erklärt, welche personenbezogenen Daten die Website verarbeitet, warum, und welche Rechte Sie nach der EU-Datenschutz-Grundverordnung (DSGVO) und dem Schweizer Datenschutzgesetz (DSG) haben.",
    sections: [
      { h: "Verantwortlicher", p: ["Die Website wird vom Betreiber von {site} betrieben, der für die Datenverarbeitung verantwortlich ist. Bei Fragen zu Ihren Daten erreichen Sie den Betreiber unter {email}."] },
      {
        h: "Welche Daten wir erheben",
        list: [
          "Ihre E-Mail-Adresse, nur wenn Sie sich anmelden. Sie dient dazu, Ihnen einen Anmeldelink zu senden und Sie angemeldet zu halten. Sie wird anderen Besuchern nie angezeigt.",
          "Den Anzeigenamen, den Sie wählen. Er erscheint neben Ihren Kommentaren, außer Sie posten anonym.",
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
          "GitHub: führt die Skripte aus, die Zugdaten von SNCF und opentransportdata.swiss abrufen. Diese Skripte verarbeiten keine Besucherdaten.",
        ],
      },
      { h: "Zugdaten", p: ["Fahrpläne und Echtzeit-Verspätungen stammen aus den Open Data der SNCF (transport.data.gouv.fr) und für die Schweiz von opentransportdata.swiss. Sie enthalten keine personenbezogenen Daten."] },
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
        list2: "Sie können sich bei einer Datenschutzbehörde beschweren, zum Beispiel beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten in der Schweiz (www.edoeb.admin.ch), bei der CNIL in Frankreich (www.cnil.fr) oder bei der Behörde in Ihrem Land.",
      },
      { h: "Kinder", p: ["Die Website richtet sich nicht an Kinder unter 15 Jahren. Erstellen Sie kein Konto, wenn Sie jünger als 15 sind."] },
      { h: "Änderungen", p: ["Wenn wir den Umgang mit Daten ändern, aktualisieren wir diese Seite und das Datum oben."] },
    ],
  },
  fr: {
    title: "Politique de confidentialité",
    updated: "Dernière mise à jour",
    intro: "{site} indique les retards des trains en France et en Suisse et permet aux voyageurs de partager ce qui se passe à bord. Cette page explique quelles données personnelles le site traite, pourquoi, et quels sont vos droits selon le Règlement général sur la protection des données (RGPD) et la loi suisse sur la protection des données (LPD).",
    sections: [
      { h: "Responsable du traitement", p: ["Le site est géré par l’exploitant de {site}, responsable du traitement. Vous pouvez le contacter à {email} pour toute question sur vos données."] },
      {
        h: "Données collectées",
        list: [
          "Votre adresse e-mail, uniquement si vous vous connectez. Elle sert à vous envoyer un lien de connexion et à garder votre session ouverte. Elle n’est jamais affichée aux autres visiteurs.",
          "Le nom d’affichage que vous choisissez. Il apparaît à côté de vos commentaires, sauf si vous publiez anonymement.",
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
          "GitHub : exécute les scripts qui récupèrent les données SNCF et opentransportdata.swiss. Ces scripts ne traitent aucune donnée des visiteurs.",
        ],
      },
      { h: "Données ferroviaires", p: ["Les horaires et les retards en temps réel proviennent de l’open data SNCF (transport.data.gouv.fr) et, pour la Suisse, d’opentransportdata.swiss. Ils ne contiennent aucune donnée personnelle."] },
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
        list2: "Vous pouvez introduire une réclamation auprès d’une autorité de protection des données, par exemple le Préposé fédéral à la protection des données et à la transparence en Suisse (www.edoeb.admin.ch), la CNIL en France (www.cnil.fr) ou l’autorité de votre pays.",
      },
      { h: "Mineurs", p: ["Le site ne s’adresse pas aux enfants de moins de 15 ans. Ne créez pas de compte si vous avez moins de 15 ans."] },
      { h: "Modifications", p: ["Si nous modifions la façon dont nous traitons les données, nous mettrons à jour cette page et la date indiquée en haut."] },
    ],
  },
};
