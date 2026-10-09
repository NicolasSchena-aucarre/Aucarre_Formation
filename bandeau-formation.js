/* ==========================================================
   bandeau-formation.js — bandeau « au carré · formation », autonome.

   UTILISATION (dans le <head> du widget, une seule ligne) :

     <script src="https://nicolasschena-aucarre.github.io/Aucarre_Formation/bandeau-formation.js"
             data-titre="Mon espace"></script>

   Le bandeau ne demande AUCUN accès à Grist et ne lit aucune table : c'est le
   widget qui lui transmet ce qu'il a déjà chargé, avec les fonctions ci-dessous.
   Chaque fonction peut être rappelée aussi souvent qu'on veut (par exemple à
   chaque relecture des données) : elle met à jour ce qui a changé et ne touche
   pas au reste (un menu ou une liste qui a le focus le garde).

   DISPOSITION (une ligne principale ; les onglets passent sur leur propre ligne s'il y a plus de 4 vues)
     ligne 1 : logo | titre | promo   onglets   ...   signal  prénom + avatar
     ligne 2 : devise | « Ta promo en est au module N sur M »   (apprenants, toujours visible)
   Chaque zone n'apparaît que si le widget l'a alimentée.
   Pour l'équipe (fonction promos), le nom de la promo est un bouton léger qui ouvre la liste des promos.
   Le signal indique qu'il y a quelque chose à faire, à deux endroits : une icône de feuille d'émargement
   avec un point, à gauche du prénom (elle ouvre la vue indiquée), et un point sur l'onglet de cette vue.

   FONCTIONS (window.BandeauFormation) :

     personne({ prenom: "Vincent", nom: "Ferreira" })      // ou { nomComplet: "Vincent Ferreira" } ; null = masquée

     promo({ nom: "Renaissance", icone: "🚀", devise: "Ensemble, on avance" })   // icône et devise facultatives

     progression({ module: 2, total: 6 })                  // « Ta promo en est au module 2 sur 6 » ; null = masquée

     notification({ texte: "Un créneau d'émargement est ouvert.", vue: "emargement" })
                                                           // signal ; « vue » = id de l'onglet à marquer, et que le clic ouvre ; null = masqué

     navigation({ entrees: [ { id: "parcours", nom: "Mon parcours" }, ... ],
                  actif: "parcours",
                  surChoix: function (id) { ... } })       // la fonction reçoit l'id de la vue choisie

     promos({ liste: [ { id: 3, nom: "Renaissance", icone: "🚀", devise: "…", active: true }, ... ],
              choisie: 3,
              consultation: false,                         // true : promo terminée, affiche « Consultation seule »
              surChoix: function (id) { ... } })           // le nom de la promo devient une liste de choix (équipe) ;
                                                           // la ligne « devise | progression » n'est alors pas affichée

   LA CHARTE : les couleurs suivent les variables --ac-* de aucarre-ui.css quand la page
   les définit ; sinon les valeurs de repli ci-dessous s'appliquent.

   LE LOGO : cherché dans  logo/logo.png  à côté de ce fichier. L'attribut data-logo de la balise
   <script> permet d'indiquer une autre adresse (https). Si l'image ne charge pas, le texte « au carré » la remplace.

   DIAGNOSTIC : dans la console du widget, taper  BandeauFormation.etat()
   ========================================================== */
(function () {
  "use strict";

  if (window.BandeauFormation) return; // fichier chargé deux fois : une seule instance

  var VERSION = "2026-10-09-formation-4";
  console.info("[bandeau-formation] version " + VERSION);

  // ---- Configuration (seul endroit à éditer) --------------------------------
  // Adresse de repli si le script n'a pas été chargé par une balise statique.
  var DOSSIER_PAR_DEFAUT = "https://nicolasschena-aucarre.github.io/Aucarre_Formation/";
  // ---------------------------------------------------------------------------

  var script = document.currentScript;
  var dossier = script && script.src ? script.src.split(/[?#]/)[0].replace(/[^\/]*$/, "") : DOSSIER_PAR_DEFAUT;
  var logoDemande = script && script.dataset ? script.dataset.logo : "";
  var titre = ((script && script.dataset && script.dataset.titre) || "").trim();

  // Seules les adresses http(s) sont acceptées pour le logo.
  function urlSure(u) {
    return typeof u === "string" && /^https?:\/\//i.test(u.trim()) ? u.trim() : null;
  }
  var URL_LOGO = urlSure(logoDemande) || dossier + "logo/logo.png";

  var ui = null; // éléments du bandeau, une fois construit
  var etat = { personne: null, promo: null, progression: null, notification: null, navigation: null, promos: null };
  var rappels = { vue: null, promo: null };
  var derniereAnnonce = "";
  var NB_VUES_UNE_LIGNE = 4; // au-delà, les onglets passent sur une seconde ligne

  var SVG_EMARGEMENT = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/></svg>';

  // Style du bandeau, isolé dans le Shadow DOM. var(--ac-x, repli) : la charte de la page l'emporte quand elle existe.
  var CSS = [
    ":host{display:block;position:sticky;top:0;z-index:20;flex:none;font-family:Montserrat,Arial,sans-serif;font-size:14px;line-height:1.4;-webkit-font-smoothing:antialiased}",
    "*{box-sizing:border-box}",
    "[hidden]{display:none!important}",
    "p{margin:0}",
    "ul{list-style:none;margin:0;padding:0}",
    ".bf-header{background:var(--ac-white,#ffffff);color:var(--ac-black,#090c0b);padding:0 24px;border-bottom:1.5px solid var(--ac-black,#090c0b)}",
    // Grille : une ligne (gauche | onglets | droite) ou deux (onglets en dessous).
    ".bf-inner{max-width:1240px;margin:0 auto;min-height:60px;display:grid;align-items:center;column-gap:16px;grid-template-columns:minmax(0,auto) 1fr auto;grid-template-areas:\"gauche nav droite\" \"info info info\"}",
    ".bf-inner.bf-deux-lignes{grid-template-areas:\"gauche . droite\" \"info info info\" \"nav nav nav\"}",
    ".bf-gauche{grid-area:gauche;display:flex;align-items:center;gap:8px 16px;min-width:0}",
    ".bf-droite{grid-area:droite;display:flex;align-items:center;gap:4px}",
    ".bf-nav{grid-area:nav}",
    // ligne « devise | progression », sous la marque et la promo, à gauche
    ".bf-info{grid-area:info;display:flex;flex-wrap:wrap;align-items:center;gap:0 12px;padding:0 0 8px;font-size:13px;line-height:1.4}",
    ".bf-info-devise{font-weight:600}",
    ".bf-info-sep{width:1px;height:13px;background:rgba(9,12,11,.3)}",
    ".bf-info-progression{font-weight:500;color:var(--ac-grey-dark,#59736e)}",
    // marque
    ".bf-marque{display:flex;align-items:center;gap:12px;flex:none}",
    ".bf-logo{height:40px;width:auto;display:block;flex:none}",
    ".bf-logo-texte{font-weight:800;font-size:18px}",
    ".bf-sep{width:1px;height:20px;background:rgba(9,12,11,.18)}",
    ".bf-titre{font-weight:500}",
    // promo : un bouton léger, qui ouvre une petite fenêtre
    ".bf-promo{position:relative;display:flex;align-items:center;gap:8px;min-width:0}",
    ".bf-promo-bouton,.bf-promo-simple{display:inline-flex;align-items:center;gap:8px;min-width:0;min-height:44px;padding:0 8px;margin:0 -8px;font:inherit;color:inherit;background:none;border:none;border-radius:8px}",
    ".bf-promo-bouton{cursor:pointer}",
    ".bf-promo-bouton:hover{background:var(--ac-grey-light,#f2f2f2)}",
    ".bf-promo-icone{flex:none;font-size:20px;line-height:1}",
    ".bf-promo-nom{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px;font-weight:800;line-height:1.2}",
    ".bf-chevron{flex:none;font-size:11px;line-height:1}",
    ".bf-chip{display:inline-block;padding:1px 10px;font-size:12px;font-weight:700;border:1.5px solid var(--ac-black,#090c0b);border-radius:8px;background:var(--ac-grey-light,#f2f2f2)}",
    ".bf-panneau{position:absolute;top:calc(100% + 4px);left:-8px;z-index:50;min-width:min(280px,92vw);max-width:min(92vw,340px);padding:12px 16px;background:var(--ac-white,#ffffff);border:1.5px solid var(--ac-black,#090c0b);border-radius:12px;box-shadow:0 8px 24px rgba(9,12,11,.14)}",
    ".bf-panneau-titre{font-size:12px;font-weight:700;color:var(--ac-grey-dark,#59736e);margin-bottom:4px}",
    ".bf-liste button{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;padding:4px 8px;font:inherit;text-align:left;color:inherit;background:none;border:none;border-radius:8px;cursor:pointer}",
    ".bf-liste button:hover{background:var(--ac-grey-light,#f2f2f2)}",
    ".bf-liste button[aria-current=\"true\"]{font-weight:800}",
    // onglets : du texte, souligné pour la vue en cours
    ".bf-nav{display:flex;gap:4px;overflow-x:auto}",
    ".bf-nav-bouton{flex:none;min-height:44px;padding:0 12px;font:inherit;font-weight:500;color:inherit;background:none;border:none;border-bottom:3px solid transparent;border-radius:0;cursor:pointer}",
    ".bf-nav-bouton:hover{background:var(--ac-grey-light,#f2f2f2)}",
    ".bf-nav-bouton[aria-current=\"page\"]{font-weight:700;border-bottom-color:var(--ac-black,#090c0b)}",
    ".bf-nav-point{display:inline-block;width:10px;height:10px;margin-left:8px;vertical-align:middle;border-radius:50%;background:var(--ac-orange,#ff6b3d);border:2px solid var(--ac-black,#090c0b)}",
    ".bf-inner:not(.bf-deux-lignes) .bf-nav{margin-left:8px}",
    ".bf-deux-lignes .bf-nav{margin-left:-12px;min-height:40px;border-top:1px solid rgba(9,12,11,.12)}",
    ".bf-deux-lignes .bf-nav-bouton{min-height:40px}",
    // signal d'émargement (icône à droite)
    ".bf-notif{position:relative;display:inline-grid;place-items:center;width:44px;height:44px;padding:0;color:inherit;background:none;border:none;border-radius:50%;cursor:pointer}",
    "span.bf-notif{cursor:default}",
    "button.bf-notif:hover{background:var(--ac-grey-light,#f2f2f2)}",
    ".bf-notif-point{position:absolute;top:9px;right:9px;width:12px;height:12px;border-radius:50%;background:var(--ac-orange,#ff6b3d);border:2px solid var(--ac-black,#090c0b)}",
    ".bf-bulle{display:none;position:absolute;top:calc(100% + 2px);right:0;z-index:60;padding:4px 10px;font-size:13px;font-weight:500;white-space:nowrap;color:var(--ac-white,#ffffff);background:var(--ac-black,#090c0b);border-radius:8px}",
    ".bf-notif:hover .bf-bulle,.bf-notif:focus-visible .bf-bulle{display:block}",
    // personne
    ".bf-personne{display:flex;align-items:center;gap:8px;padding-left:4px}",
    ".bf-prenom{font-weight:500}",
    ".bf-avatar{width:36px;height:36px;border-radius:50%;background:var(--ac-turquoise,#45f8cf);color:var(--ac-black,#090c0b);display:grid;place-items:center;font-size:13px;font-weight:800}",
    // focus et lecteurs d'écran
    ".bf-promo-bouton:focus-visible,.bf-liste button:focus-visible,.bf-notif:focus-visible{outline:3px solid var(--ac-black,#090c0b);outline-offset:2px}",
    ".bf-nav-bouton:focus-visible{outline:3px solid var(--ac-black,#090c0b);outline-offset:-3px}",
    ".bf-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}",
    // écran étroit : onglets toujours sur leur propre ligne, marges de 16 px
    "@media (max-width:720px){.bf-header{padding:0 16px}.bf-inner,.bf-inner.bf-deux-lignes{grid-template-areas:\"gauche . droite\" \"info info info\" \"nav nav nav\"}.bf-inner .bf-nav{margin-left:-12px;min-height:40px;border-top:1px solid rgba(9,12,11,.12)}.bf-sep,.bf-titre,.bf-prenom,.bf-info-sep{display:none}.bf-logo{height:30px}.bf-logo-texte{font-size:15px}.bf-gauche{gap:4px 12px}}"
  ].join("");

  // Mise en page de la PAGE (hors Shadow DOM) : bandeau + contenu en colonne, le contenu prenant
  // le reste de la fenêtre. Limité aux widgets x-dc (:has(> #dc-root)) : une autre page n'est pas touchée.
  var CSS_PAGE = [
    "html body:has(> #bf-bandeau):has(> #dc-root){display:flex;flex-direction:column;height:auto;min-height:100%}",
    "html body > #dc-root{flex:1 0 auto;height:auto}",
    "html body > #dc-root > .sc-host{height:auto}"
  ].join("");

  // ---------- Utilitaires ----------
  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    for (var k in (attrs || {})) n.setAttribute(k, attrs[k]);
    return n;
  }

  function texte(v, max) {
    var t = String(v == null ? "" : v).trim();
    return max && t.length > max ? t.slice(0, max) : t;
  }

  function entierPositif(v) {
    return typeof v === "number" && isFinite(v) && v >= 1 && Math.floor(v) === v;
  }

  // { prenom, nom } ou { nomComplet } -> { prenom, initiales }
  function identite(p) {
    var complet = texte(p.nomComplet, 80);
    var prenom = texte(p.prenom, 40);
    var nom = texte(p.nom, 40);
    if (complet) {
      var mots = complet.split(/\s+/);
      return { prenom: prenom || mots[0], initiales: (mots[0].charAt(0) + (mots.length > 1 ? mots[mots.length - 1].charAt(0) : "")).toUpperCase() };
    }
    return { prenom: prenom, initiales: (prenom.charAt(0) + nom.charAt(0)).toUpperCase() };
  }

  // ---------- Construction ----------
  function construire() {
    if (document.getElementById("bf-bandeau")) return;

    var host = el("div", null, { id: "bf-bandeau" });
    var root = host.attachShadow({ mode: "open" });
    var style = el("style");
    style.textContent = CSS;

    var header = el("header", "bf-header");
    var inner = el("div", "bf-inner");

    // Gauche : logo, titre, promo
    var gauche = el("div", "bf-gauche");
    var marque = el("div", "bf-marque");
    var logo = el("img", "bf-logo", { src: URL_LOGO, alt: "au carré" });
    var logoTexte = el("span", "bf-logo-texte");
    logoTexte.textContent = "au carré";
    logoTexte.hidden = true;
    logo.addEventListener("error", function () { logo.hidden = true; logoTexte.hidden = false; });
    var sep = el("span", "bf-sep", { "aria-hidden": "true" });
    var sub = el("span", "bf-titre");
    sub.textContent = titre;
    sep.hidden = sub.hidden = !titre;
    marque.appendChild(logo);
    marque.appendChild(logoTexte);
    marque.appendChild(sep);
    marque.appendChild(sub);

    // La promo : un bouton quand une petite fenêtre est disponible, sinon un simple texte.
    var promo = el("div", "bf-promo");
    promo.hidden = true;
    var promoBouton = el("button", "bf-promo-bouton", { type: "button", "aria-expanded": "false", "aria-controls": "bf-panneau" });
    var promoSimple = el("span", "bf-promo-simple");
    var promoIcone = el("span", "bf-promo-icone", { "aria-hidden": "true" });
    var promoNom = el("span", "bf-promo-nom");
    var chevron = el("span", "bf-chevron", { "aria-hidden": "true" });
    chevron.textContent = "▾";
    promoBouton.appendChild(promoIcone);
    promoBouton.appendChild(promoNom);
    promoBouton.appendChild(chevron);
    var chip = el("span", "bf-chip");
    chip.textContent = "Consultation seule";
    chip.hidden = true;
    var panneau = el("div", "bf-panneau", { id: "bf-panneau", role: "group" });
    panneau.hidden = true;
    promo.appendChild(promoBouton);
    promo.appendChild(promoSimple);
    promo.appendChild(chip);
    promo.appendChild(panneau);

    gauche.appendChild(marque);
    gauche.appendChild(promo);

    // Ligne d'information : devise | progression de la promo
    var info = el("div", "bf-info");
    info.hidden = true;
    var infoDevise = el("span", "bf-info-devise");
    var infoSep = el("span", "bf-info-sep", { "aria-hidden": "true" });
    var infoProgression = el("span", "bf-info-progression");
    info.appendChild(infoDevise);
    info.appendChild(infoSep);
    info.appendChild(infoProgression);

    // Onglets
    var nav = el("nav", "bf-nav", { "aria-label": "Navigation" });
    nav.hidden = true;

    // Droite : signal, prénom et avatar
    var droite = el("div", "bf-droite");
    var notif = el("button", "bf-notif", { type: "button" });
    notif.hidden = true;
    var notifBulle = el("span", "bf-bulle", { "aria-hidden": "true" });
    var notifPoint = el("span", "bf-notif-point", { "aria-hidden": "true" });
    var notifIcone = el("span", null, { "aria-hidden": "true" });
    notifIcone.innerHTML = SVG_EMARGEMENT; // texte constant défini dans ce fichier, jamais une donnée transmise
    notif.appendChild(notifIcone);
    notif.appendChild(notifPoint);
    notif.appendChild(notifBulle);

    var personne = el("div", "bf-personne");
    personne.hidden = true;
    var prenom = el("span", "bf-prenom");
    var avatar = el("span", "bf-avatar", { "aria-hidden": "true" });
    personne.appendChild(prenom);
    personne.appendChild(avatar);
    droite.appendChild(notif);
    droite.appendChild(personne);

    inner.appendChild(gauche);
    inner.appendChild(info);
    inner.appendChild(nav);
    inner.appendChild(droite);
    header.appendChild(inner);
    var annonce = el("div", "bf-sr", { role: "status" });
    root.appendChild(style);
    root.appendChild(header);
    root.appendChild(annonce);

    ui = {
      host: host, inner: inner, promo: promo, promoBouton: promoBouton, promoSimple: promoSimple, promoIcone: promoIcone,
      promoNom: promoNom, chevron: chevron, chip: chip, panneau: panneau, nav: nav, navSig: null,
      info: info, infoDevise: infoDevise, infoSep: infoSep, infoProgression: infoProgression,
      notif: notif, notifBulle: notifBulle, personne: personne, prenom: prenom, avatar: avatar, annonce: annonce
    };

    promoBouton.addEventListener("click", function (e) { e.stopPropagation(); basculerPanneau(panneau.hidden); });
    notif.addEventListener("click", function () {
      if (etat.notification && etat.notification.vue !== undefined) choisirVue(etat.notification.vue);
    });
    // Un clic ailleurs dans la page referme la fenêtre de la promo ; Échap aussi.
    document.addEventListener("click", function (e) {
      if (e.composedPath().indexOf(promo) === -1) basculerPanneau(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panneau.hidden) { basculerPanneau(false); promoBouton.focus(); }
    });

    var stylePage = el("style");
    stylePage.textContent = CSS_PAGE;
    document.head.appendChild(stylePage);
    document.body.insertBefore(host, document.body.firstChild);

    rendrePersonne();
    rendrePromo();
    rendreNotification();
    rendreNavigation();
  }

  // ---------- Rendus (chacun peut être rappelé sans effet de bord) ----------
  function rendrePersonne() {
    if (!ui) return;
    var p = etat.personne;
    ui.personne.hidden = !p;
    if (!p) return;
    var id = identite(p);
    ui.prenom.textContent = id.prenom;
    ui.avatar.textContent = id.initiales;
  }

  // Promo affichée : celle choisie dans la liste (équipe) ou celle transmise (apprenants).
  function promoAffichee() {
    var liste = etat.promos ? etat.promos.liste : null;
    if (liste) return liste.filter(function (p) { return String(p.id) === String(etat.promos.choisie); })[0] || liste[0] || null;
    return etat.promo;
  }

  // La petite fenêtre n'existe que pour l'équipe : la liste des promos.
  function contenuPanneauDisponible() {
    return !!(promoAffichee() && etat.promos);
  }

  // Ligne « devise | progression » : apprenants seulement (pas de liste de promos), toujours visible.
  function rendreInfo() {
    if (!ui) return;
    var devise = !etat.promos && etat.promo ? etat.promo.devise : "";
    var progression = !etat.promos && etat.progression
      ? "Ta promo en est au module " + etat.progression.module + " sur " + etat.progression.total + "."
      : "";
    ui.info.hidden = !devise && !progression;
    ui.infoDevise.textContent = devise;
    ui.infoDevise.hidden = !devise;
    ui.infoProgression.textContent = progression;
    ui.infoProgression.hidden = !progression;
    ui.infoSep.hidden = !(devise && progression);
  }

  function rendrePromo() {
    if (!ui) return;
    var info = promoAffichee();
    rendreInfo();
    ui.promo.hidden = !info;
    if (!info) { basculerPanneau(false); return; }

    var interactif = contenuPanneauDisponible();
    ui.promoIcone.textContent = info.icone;
    ui.promoIcone.hidden = !info.icone;
    ui.promoNom.textContent = info.nom;
    if (!interactif) {
      ui.promoSimple.textContent = "";
      if (info.icone) { var i = el("span", "bf-promo-icone", { "aria-hidden": "true" }); i.textContent = info.icone; ui.promoSimple.appendChild(i); }
      var n = el("span", "bf-promo-nom"); n.textContent = info.nom; ui.promoSimple.appendChild(n);
    }
    ui.promoBouton.hidden = !interactif;
    ui.promoSimple.hidden = interactif;
    ui.chip.hidden = !(etat.promos && etat.promos.consultation);
    if (!interactif) basculerPanneau(false);
    else if (!ui.panneau.hidden) rendrePanneau();
  }

  // Contenu de la petite fenêtre : la liste des promos (équipe).
  function rendrePanneau() {
    ui.panneau.textContent = "";
    var info = promoAffichee();
    if (!info || !etat.promos) return;
    ui.panneau.setAttribute("aria-label", "Changer de promo");
    var titreListe = el("p", "bf-panneau-titre");
    titreListe.textContent = "Promo affichée";
    var ul = el("ul", "bf-liste");
    etat.promos.liste.forEach(function (p) {
      var li = el("li");
      var b = el("button", null, { type: "button" });
      var choisie = String(p.id) === String(info.id);
      if (choisie) b.setAttribute("aria-current", "true");
      b.textContent = (choisie ? "✓ " : "") + (p.icone ? p.icone + " " : "") + p.nom + (p.active ? " — active" : "");
      b.addEventListener("click", function () {
        etat.promos.choisie = p.id;
        rendrePromo();
        basculerPanneau(false);
        ui.promoBouton.focus();
        if (rappels.promo) rappels.promo(p.id);
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
    ui.panneau.appendChild(titreListe);
    ui.panneau.appendChild(ul);
  }

  function basculerPanneau(ouvrir) {
    if (!ui) return;
    var peut = ouvrir && contenuPanneauDisponible();
    if (peut) rendrePanneau();
    ui.panneau.hidden = !peut;
    ui.promoBouton.setAttribute("aria-expanded", peut ? "true" : "false");
  }

  function rendreNotification() {
    if (!ui) return;
    var n = etat.notification;
    ui.notif.hidden = !n;
    var annonceTexte = n ? n.texte : "";
    if (n) {
      ui.notif.setAttribute("aria-label", n.texte + (n.vue !== undefined && etat.navigation && rappels.vue ? " Ouvrir." : ""));
      ui.notifBulle.textContent = n.texte;
    }
    // Annonce vocale : seulement quand le texte change, jamais à chaque relecture des données.
    if (annonceTexte !== derniereAnnonce) {
      derniereAnnonce = annonceTexte;
      ui.annonce.textContent = annonceTexte;
    }
  }

  function rendreNavigation() {
    if (!ui) return;
    var n = etat.navigation;
    var entrees = n ? n.entrees : [];
    ui.nav.hidden = entrees.length < 2; // une seule vue : rien à choisir
    ui.inner.classList.toggle("bf-deux-lignes", entrees.length > NB_VUES_UNE_LIGNE);
    var sig = JSON.stringify(entrees.map(function (e) { return [e.id, e.nom]; }));
    if (sig !== ui.navSig) {
      ui.nav.textContent = "";
      entrees.forEach(function (e) {
        var b = el("button", "bf-nav-bouton", { type: "button", "data-id": String(e.id) });
        b.appendChild(document.createTextNode(e.nom));
        var point = el("span", "bf-nav-point", { "aria-hidden": "true" });
        var aFaire = el("span", "bf-sr");
        aFaire.textContent = " (à faire)";
        point.hidden = aFaire.hidden = true;
        b.appendChild(point);
        b.appendChild(aFaire);
        b.addEventListener("click", function () { choisirVue(e.id); });
        ui.nav.appendChild(b);
      });
      ui.navSig = sig;
    }
    // Seuls l'état « vue en cours » et le point « à faire » sont mis à jour : les boutons gardent leur focus.
    var vueSignalee = etat.notification && etat.notification.vue !== undefined ? String(etat.notification.vue) : null;
    Array.prototype.forEach.call(ui.nav.children, function (b) {
      if (n && b.getAttribute("data-id") === String(n.actif)) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
      var signale = vueSignalee !== null && b.getAttribute("data-id") === vueSignalee;
      b.querySelector(".bf-nav-point").hidden = !signale;
      b.querySelector(".bf-sr").hidden = !signale;
    });
  }

  function choisirVue(id) {
    if (etat.navigation) { etat.navigation.actif = id; rendreNavigation(); }
    if (rappels.vue) rappels.vue(id);
  }

  // ---------- API pour le widget hôte ----------
  window.BandeauFormation = {
    version: VERSION,

    personne: function (p) {
      etat.personne = p && typeof p === "object" && (texte(p.prenom) || texte(p.nomComplet)) ? p : null;
      rendrePersonne();
    },

    promo: function (p) {
      etat.promo = p && typeof p === "object" && texte(p.nom)
        ? { nom: texte(p.nom, 60), icone: texte(p.icone, 8), devise: texte(p.devise, 80) }
        : null;
      rendrePromo();
    },

    progression: function (p) {
      etat.progression = p && entierPositif(p.module) && entierPositif(p.total) ? { module: p.module, total: p.total } : null;
      rendrePromo();
    },

    notification: function (n) {
      etat.notification = n && typeof n === "object" && texte(n.texte)
        ? { texte: texte(n.texte, 160), vue: n.vue }
        : null;
      rendreNotification();
      rendreNavigation(); // le point de l'onglet suit la notification
    },

    navigation: function (n) {
      if (n && typeof n.surChoix === "function") rappels.vue = n.surChoix;
      etat.navigation = n && Array.isArray(n.entrees)
        ? {
            entrees: n.entrees.filter(function (e) { return e && e.id !== undefined && texte(e.nom); })
              .map(function (e) { return { id: e.id, nom: texte(e.nom, 40) }; }),
            actif: n.actif
          }
        : null;
      rendreNavigation();
      rendreNotification(); // l'étiquette du signal dépend de la navigation
    },

    promos: function (p) {
      if (p && typeof p.surChoix === "function") rappels.promo = p.surChoix;
      etat.promos = p && Array.isArray(p.liste)
        ? {
            liste: p.liste.filter(function (x) { return x && x.id !== undefined && texte(x.nom); })
              .map(function (x) { return { id: x.id, nom: texte(x.nom, 60), icone: texte(x.icone, 8), devise: texte(x.devise, 80), active: x.active === true }; }),
            choisie: p.choisie,
            consultation: p.consultation === true
          }
        : null;
      if (etat.promos && !etat.promos.liste.length) etat.promos = null;
      rendrePromo();
    },

    // Aide au diagnostic : dans la console du widget, taper  BandeauFormation.etat()
    etat: function () {
      return {
        version: VERSION,
        logo: URL_LOGO,
        titre: titre,
        construit: !!ui,
        personne: etat.personne,
        promo: etat.promo,
        progression: etat.progression,
        notification: etat.notification,
        navigation: etat.navigation,
        promos: etat.promos
      };
    }
  };

  if (document.body) construire();
  else document.addEventListener("DOMContentLoaded", construire);
})();
