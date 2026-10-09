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

   DISPOSITION
     ligne 1 : logo | titre | promo (icône, nom, devise)  ...  prénom + avatar
     ligne 2 : message (par exemple « un créneau d'émargement est ouvert »)
     ligne 3 : navigation entre les vues du widget
   Chaque zone n'apparaît que si le widget l'a alimentée.

   FONCTIONS (window.BandeauFormation) :

     personne({ prenom: "Vincent", nom: "Ferreira" })      // ou { nomComplet: "Vincent Ferreira" } ; null = masquée

     promo({ nom: "Renaissance", icone: "🚀", devise: "Ensemble, on avance" })   // icône et devise facultatives

     progression({ module: 2, total: 6 })                  // « Ta promo en est au module 2 sur 6 » ; null = masquée

     notification({ texte: "Un créneau d'émargement est ouvert.", libelle: "Émarger", vue: "emargement" })
                                                           // libelle + vue : bouton qui ouvre cette vue ; null = masquée

     navigation({ entrees: [ { id: "parcours", nom: "Mon parcours" }, ... ],
                  actif: "parcours",
                  surChoix: function (id) { ... } })       // la fonction reçoit l'id de la vue choisie

     promos({ liste: [ { id: 3, nom: "Renaissance", icone: "🚀", devise: "…", active: true }, ... ],
              choisie: 3,
              consultation: false,                         // true : promo terminée, affiche « Consultation seule »
              surChoix: function (id) { ... } })           // remplace le nom de la promo par une liste de choix (équipe)

   LA CHARTE : les couleurs suivent les variables --ac-* de aucarre-ui.css quand la page
   les définit ; sinon les valeurs de repli ci-dessous s'appliquent.

   LE LOGO : cherché dans  logo/logo.png  à côté de ce fichier. L'attribut data-logo de la balise
   <script> permet d'indiquer une autre adresse (https). Si l'image ne charge pas, le texte « au carré » la remplace.

   DIAGNOSTIC : dans la console du widget, taper  BandeauFormation.etat()
   ========================================================== */
(function () {
  "use strict";

  if (window.BandeauFormation) return; // fichier chargé deux fois : une seule instance

  var VERSION = "2026-10-09-formation-1";
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

  // Style du bandeau, isolé dans le Shadow DOM. var(--ac-x, repli) : la charte de la page l'emporte quand elle existe.
  var CSS = [
    ":host{display:block;position:sticky;top:0;z-index:20;flex:none;font-family:Montserrat,Arial,sans-serif;font-size:16px;line-height:1.4;-webkit-font-smoothing:antialiased}",
    "*{box-sizing:border-box}",
    "[hidden]{display:none!important}",
    "p{margin:0}",
    ".bf-header{background:var(--ac-white,#ffffff);color:var(--ac-black,#090c0b);padding:0 24px;border-bottom:2px solid var(--ac-black,#090c0b)}",
    ".bf-inner{max-width:1240px;margin:0 auto}",
    ".bf-haut{display:flex;align-items:center;justify-content:space-between;gap:16px 24px;flex-wrap:wrap;padding:8px 0;min-height:72px}",
    ".bf-gauche{display:flex;align-items:center;gap:16px 24px;flex-wrap:wrap;min-width:0}",
    ".bf-marque{display:flex;align-items:center;gap:12px;min-width:0}",
    ".bf-logo{height:48px;width:auto;display:block}",
    ".bf-logo-texte{font-weight:800;font-size:20px}",
    ".bf-sep{width:1px;height:20px;background:rgba(9,12,11,.18)}",
    ".bf-titre{font-weight:500}",
    // promo
    ".bf-promo{display:flex;align-items:center;gap:12px;min-width:0}",
    ".bf-promo-icone{font-size:32px;line-height:1}",
    ".bf-promo-nom{font-size:20px;font-weight:800;line-height:1.2}",
    ".bf-promo-devise{font-size:14px;font-weight:500;color:var(--ac-grey-dark,#59736e)}",
    ".bf-promo-progression{font-size:14px;font-weight:500}",
    ".bf-choix{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
    ".bf-choix label{font-size:14px;font-weight:700}",
    ".bf-choix select{min-height:44px;max-width:100%;padding:8px 16px;font:inherit;font-weight:700;color:var(--ac-black,#090c0b);background:var(--ac-white,#ffffff);border:2px solid var(--ac-black,#090c0b);border-radius:var(--ac-radius-sm,8px)}",
    ".bf-chip{display:inline-block;padding:2px 12px;font-size:14px;font-weight:700;border:2px solid var(--ac-black,#090c0b);border-radius:var(--ac-radius-sm,8px);background:var(--ac-grey-light,#f2f2f2)}",
    // personne
    ".bf-personne{display:flex;align-items:center;gap:8px}",
    ".bf-prenom{font-weight:500}",
    ".bf-avatar{width:40px;height:40px;border-radius:50%;background:var(--ac-turquoise,#45f8cf);color:var(--ac-black,#090c0b);display:grid;place-items:center;font-size:14px;font-weight:800}",
    // message
    ".bf-message{display:flex;align-items:center;justify-content:space-between;gap:8px 16px;flex-wrap:wrap;margin:0 0 8px;padding:8px 16px;background:var(--ac-grey-light,#f2f2f2);border:2px solid var(--ac-black,#090c0b);border-radius:var(--ac-radius-sm,8px)}",
    // navigation
    ".bf-nav{display:flex;gap:8px;padding:0 0 8px;overflow-x:auto}",
    ".bf-nav-bouton{flex:none;min-height:44px;padding:8px 16px;font:inherit;font-weight:500;color:var(--ac-black,#090c0b);background:none;border:2px solid transparent;border-radius:var(--ac-radius-sm,8px);cursor:pointer}",
    ".bf-nav-bouton:hover{background:var(--ac-grey-light,#f2f2f2)}",
    ".bf-nav-bouton[aria-current=\"page\"]{font-weight:700;background:var(--ac-turquoise,#45f8cf);border-color:var(--ac-black,#090c0b)}",
    // boutons et focus
    ".bf-bouton{min-height:44px;padding:8px 16px;font:inherit;font-weight:700;color:var(--ac-black,#090c0b);background:var(--ac-white,#ffffff);border:2px solid var(--ac-black,#090c0b);border-radius:var(--ac-radius-sm,8px);cursor:pointer}",
    ".bf-nav-bouton:focus-visible,.bf-bouton:focus-visible,.bf-choix select:focus-visible{outline:3px solid var(--ac-black,#090c0b);outline-offset:2px}",
    ".bf-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}",
    "@media (max-width:600px){.bf-header{padding:0 16px}.bf-promo-nom{font-size:18px}.bf-sep,.bf-titre{display:none}}"
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
    var haut = el("div", "bf-haut");

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

    var promo = el("div", "bf-promo");
    promo.hidden = true;
    var promoIcone = el("span", "bf-promo-icone", { "aria-hidden": "true" });
    var promoCorps = el("div");
    var promoNom = el("p", "bf-promo-nom");
    var choix = el("div", "bf-choix");
    choix.hidden = true;
    var choixLabel = el("label", null, { "for": "bf-promo-choix" });
    choixLabel.textContent = "Promo";
    var select = el("select", null, { id: "bf-promo-choix" });
    var chip = el("span", "bf-chip");
    chip.textContent = "Consultation seule";
    chip.hidden = true;
    choix.appendChild(choixLabel);
    choix.appendChild(select);
    choix.appendChild(chip);
    var promoDevise = el("p", "bf-promo-devise");
    var promoProgression = el("p", "bf-promo-progression");
    promoDevise.hidden = promoProgression.hidden = true;
    promoCorps.appendChild(promoNom);
    promoCorps.appendChild(choix);
    promoCorps.appendChild(promoDevise);
    promoCorps.appendChild(promoProgression);
    promo.appendChild(promoIcone);
    promo.appendChild(promoCorps);

    gauche.appendChild(marque);
    gauche.appendChild(promo);

    // Droite : prénom + avatar
    var personne = el("div", "bf-personne");
    personne.hidden = true;
    var prenom = el("span", "bf-prenom");
    var avatar = el("span", "bf-avatar", { "aria-hidden": "true" });
    personne.appendChild(prenom);
    personne.appendChild(avatar);

    haut.appendChild(gauche);
    haut.appendChild(personne);

    // Message, navigation, et zone d'annonce pour les lecteurs d'écran
    var message = el("div", "bf-message");
    message.hidden = true;
    var messageTexte = el("span");
    var messageBouton = el("button", "bf-bouton", { type: "button" });
    messageBouton.hidden = true;
    message.appendChild(messageTexte);
    message.appendChild(messageBouton);

    var nav = el("nav", "bf-nav", { "aria-label": "Navigation" });
    nav.hidden = true;
    var annonce = el("div", "bf-sr", { role: "status" });

    inner.appendChild(haut);
    inner.appendChild(message);
    inner.appendChild(nav);
    header.appendChild(inner);
    root.appendChild(style);
    root.appendChild(header);
    root.appendChild(annonce);

    ui = {
      host: host, promo: promo, promoIcone: promoIcone, promoNom: promoNom, choix: choix, select: select, chip: chip,
      promoDevise: promoDevise, promoProgression: promoProgression, personne: personne, prenom: prenom, avatar: avatar,
      message: message, messageTexte: messageTexte, messageBouton: messageBouton, nav: nav, navSig: null, selectSig: null, annonce: annonce
    };

    messageBouton.addEventListener("click", function () {
      if (etat.notification && etat.notification.vue !== undefined) choisirVue(etat.notification.vue);
    });
    select.addEventListener("change", function () {
      var liste = etat.promos ? etat.promos.liste : [];
      var voulue = liste.filter(function (p) { return String(p.id) === select.value; })[0];
      if (voulue && etat.promos) {
        etat.promos.choisie = voulue.id;
        rendrePromo();
        if (rappels.promo) rappels.promo(voulue.id);
      }
    });

    var stylePage = el("style");
    stylePage.textContent = CSS_PAGE;
    document.head.appendChild(stylePage);
    document.body.insertBefore(host, document.body.firstChild);

    rendrePersonne();
    rendrePromo();
    rendreMessage();
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

  function rendrePromo() {
    if (!ui) return;
    var info = etat.promo;
    var choisie = null;
    var liste = etat.promos ? etat.promos.liste : null;
    if (liste) {
      choisie = liste.filter(function (p) { return String(p.id) === String(etat.promos.choisie); })[0] || liste[0] || null;
      info = choisie;
    }
    ui.promo.hidden = !info;
    if (!info) return;

    ui.promoIcone.textContent = info.icone;
    ui.promoIcone.hidden = !info.icone;
    ui.promoDevise.textContent = info.devise;
    ui.promoDevise.hidden = !info.devise;

    // Équipe : liste de choix ; apprenants : nom simple.
    ui.choix.hidden = !liste;
    ui.promoNom.hidden = !!liste;
    ui.promoNom.textContent = info.nom;
    ui.chip.hidden = !(liste && etat.promos.consultation);
    if (liste) {
      var sig = JSON.stringify(liste.map(function (p) { return [p.id, p.nom, p.icone, p.active]; }));
      if (sig !== ui.selectSig) {
        ui.select.textContent = "";
        liste.forEach(function (p) {
          var o = el("option", null, { value: String(p.id) });
          o.textContent = (p.icone ? p.icone + " " : "") + p.nom + (p.active ? " — active" : "");
          ui.select.appendChild(o);
        });
        ui.selectSig = sig;
      }
      if (choisie) ui.select.value = String(choisie.id);
    }

    var pr = etat.progression;
    ui.promoProgression.hidden = !pr;
    if (pr) ui.promoProgression.textContent = "Ta promo en est au module " + pr.module + " sur " + pr.total + ".";
  }

  function rendreMessage() {
    if (!ui) return;
    var n = etat.notification;
    ui.message.hidden = !n;
    var annonceTexte = n ? n.texte : "";
    if (n) {
      ui.messageTexte.textContent = n.texte;
      var avecBouton = !!(n.libelle && n.vue !== undefined && etat.navigation && rappels.vue);
      ui.messageBouton.hidden = !avecBouton;
      if (avecBouton) ui.messageBouton.textContent = n.libelle;
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
    var sig = JSON.stringify(entrees.map(function (e) { return [e.id, e.nom]; }));
    if (sig !== ui.navSig) {
      ui.nav.textContent = "";
      entrees.forEach(function (e) {
        var b = el("button", "bf-nav-bouton", { type: "button", "data-id": String(e.id) });
        b.textContent = e.nom;
        b.addEventListener("click", function () { choisirVue(e.id); });
        ui.nav.appendChild(b);
      });
      ui.navSig = sig;
    }
    // Seul l'état « vue en cours » est mis à jour : les boutons gardent leur focus.
    Array.prototype.forEach.call(ui.nav.children, function (b) {
      if (n && b.getAttribute("data-id") === String(n.actif)) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
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
        ? { texte: texte(n.texte, 160), libelle: texte(n.libelle, 40), vue: n.vue }
        : null;
      rendreMessage();
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
      rendreMessage(); // le bouton du message dépend de la navigation
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
