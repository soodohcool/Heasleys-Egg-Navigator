// ==UserScript==
// @name         Heasley's Egg Navigator
// @namespace    egg.traverse
// @version      1.6.3
// @description  Traverse every page in Torn in search for eggs
// @author       Heasleys4hemp [1468764]; Antonio_Balloni [3853029]
// @match        https://www.torn.com/*
// @grant        GM.addStyle
// @grant        GM.registerMenuCommand
// @run-at       document-start
// @license      MIT
// @require      https://www.torn.com/js/script/lib/jquery-1.8.2.js
// @downloadURL https://update.greasyfork.org/scripts/463484/Heasley%27s%20Egg%20Navigator.user.js
// @updateURL https://update.greasyfork.org/scripts/463484/Heasley%27s%20Egg%20Navigator.meta.js
// ==/UserScript==


/* NOTES:

Christmas Town does not spawn eggs. Source: CJ: https://www.torn.com/forums.php#/p=threads&f=19&t=16552567&b=0&a=0&start=0&to=27185449

*/


(function () {
'use strict';

const EEH_STORE_KEY = "eeh-store";
const EEH_DEFAULT_RESET_HOLD_MS = 9800;
const eeh_fade_in = 200;

let ButtonFloat;
let ButtonFloatPos;
let linkIndex;
let eeh_float_drag;
let eeh_float_x;
let eeh_float_y;
let eeh_pressTimer;
let eeh_anim_pressTimer;
let eeh_reset_time = EEH_DEFAULT_RESET_HOLD_MS;
let eeh_is_disabled = false;
let eeh_holding = false;
let eeh_drag_state;
let eeh_drag_persist_raf;
let eeh_show_page_numbers;
let eeh_resize_raf = null;
let eeh_styles_injected = false;

function clampResetHoldMs(ms) {
    if (ms == null || ms === "") return EEH_DEFAULT_RESET_HOLD_MS;
    const n = parseInt(ms, 10);
    if (Number.isNaN(n)) return EEH_DEFAULT_RESET_HOLD_MS;
    if (n < 500) return 500;
    if (n > 120000) return 120000;
    return n;
}

// Turn whatever we read from disk into sane numbers / booleans so the rest of the script doesn't have to guess.
function parseEehStore(raw) {
    const o = !raw || typeof raw !== "object" ? {} : raw;
    let floatMode = parseInt(o.float, 10);
    if (Number.isNaN(floatMode)) floatMode = 0;
    let cornerIndex = parseInt(o.floatPos, 10);
    if (Number.isNaN(cornerIndex) || cornerIndex < 0 || cornerIndex > 3) cornerIndex = 0;
    let storedIndex = o.index;
    if (storedIndex == null || storedIndex === "") storedIndex = 0;
    else {
        storedIndex = parseInt(storedIndex, 10);
        if (Number.isNaN(storedIndex)) storedIndex = 0;
    }
    const dragEnabled = !!o.drag;
    let dragX = o.dragX;
    let dragY = o.dragY;
    if (dragX != null && !Number.isNaN(Number(dragX))) dragX = Number(dragX);
    else dragX = null;
    if (dragY != null && !Number.isNaN(Number(dragY))) dragY = Number(dragY);
    else dragY = null;
    const showNum = o.showNum !== false;
    let resetHoldMs = EEH_DEFAULT_RESET_HOLD_MS;
    if (o.resetHoldMs != null && o.resetHoldMs !== "") {
        const rh = parseInt(String(o.resetHoldMs), 10);
        if (!Number.isNaN(rh)) resetHoldMs = rh;
    }
    return {
        v: 1,
        float: floatMode,
        floatPos: cornerIndex,
        index: storedIndex,
        drag: dragEnabled,
        dragX,
        dragY,
        showNum,
        resetHoldMs,
    };
}

// Shove normalized store fields into the live globals (used everywhere else).
function applyStoreToGlobals(store) {
    ButtonFloat = store.float;
    ButtonFloatPos = store.floatPos;
    linkIndex = store.index;
    eeh_float_drag = store.drag;
    eeh_float_x = store.dragX;
    eeh_float_y = store.dragY;
    eeh_show_page_numbers = store.showNum;
    eeh_reset_time = clampResetHoldMs(store.resetHoldMs);
}

// Write current globals to localStorage...skips if nothing changed so we don't spam storage events.
function saveEehStore() {
    const payload = {
        v: 1,
        float: ButtonFloat,
        floatPos: ButtonFloatPos,
        index: linkIndex,
        drag: !!eeh_float_drag,
        dragX: eeh_float_x != null && !Number.isNaN(Number(eeh_float_x)) ? Number(eeh_float_x) : null,
        dragY: eeh_float_y != null && !Number.isNaN(Number(eeh_float_y)) ? Number(eeh_float_y) : null,
        showNum: !!eeh_show_page_numbers,
        resetHoldMs: eeh_reset_time,
    };
    try {
        const json = JSON.stringify(payload);
        if (localStorage.getItem(EEH_STORE_KEY) === json) return;
        localStorage.setItem(EEH_STORE_KEY, json);
    } catch {
    }
}

// Load on startup - prefer eeh-store, else migrate old split keys once and clean them up.
function loadEehStore() {
    try {
        const raw = localStorage.getItem(EEH_STORE_KEY);
        if (raw) {
            applyStoreToGlobals(parseEehStore(JSON.parse(raw)));
            return;
        }
    } catch {
    }
    let legacyFloat = parseInt(localStorage.getItem("eeh-float"), 10);
    if (Number.isNaN(legacyFloat)) legacyFloat = 0;
    let legacyCorner = parseInt(localStorage.getItem("eeh-float-pos"), 10);
    if (Number.isNaN(legacyCorner) || legacyCorner < 0 || legacyCorner > 3) legacyCorner = 0;
    let legacyIndex = localStorage.getItem("eeh-index");
    if (legacyIndex === null || legacyIndex === "") legacyIndex = 0;
    else {
        legacyIndex = parseInt(legacyIndex, 10);
        if (Number.isNaN(legacyIndex)) legacyIndex = 0;
    }
    applyStoreToGlobals(
        parseEehStore({
            float: legacyFloat,
            floatPos: legacyCorner,
            index: legacyIndex,
            drag: false,
            dragX: null,
            dragY: null,
            showNum: true,
            resetHoldMs: EEH_DEFAULT_RESET_HOLD_MS,
        }),
    );
    saveEehStore();
    try {
        localStorage.removeItem("eeh-float");
        localStorage.removeItem("eeh-float-pos");
        localStorage.removeItem("eeh-index");
    } catch {
    }
}

loadEehStore();

try {
    if (typeof GM === "undefined") {
        window.GM = {};
    }
    if (typeof GM.addStyle === "undefined") { //Add GM.addStyle for browsers that do not support it (e.g. TornPDA, Firefox+Greasemonkey)
        GM.addStyle = (aCss) => {
            const style = document.createElement("style");
            style.setAttribute("type", "text/css");
            style.textContent = aCss;
            document.head.appendChild(style);
            return style;
        };
    }
} catch {
}

const obs_ops = { attributes: false, childList: true, characterData: false, subtree: true };

function jQueryLoaded() {
    return typeof window.$ === "function";
}

function applyWrapPositionPx(wrapElement, left, top, resetOppositeAnchors) {
    wrapElement.style.setProperty("left", `${left}px`, "important");
    wrapElement.style.setProperty("top", `${top}px`, "important");
    if (resetOppositeAnchors) {
        wrapElement.style.setProperty("right", "auto", "important");
        wrapElement.style.setProperty("bottom", "auto", "important");
    }
}

function viewportInnerSize() {
    const docEl = document.documentElement;
    return {
        w: (docEl && docEl.clientWidth) || window.innerWidth || 0,
        h: (docEl && docEl.clientHeight) || window.innerHeight || 0,
    };
}

const easteregg_svg = `<svg xmlns="http://www.w3.org/2000/svg" fill="#AFC372" stroke="transparent" stroke-width="0" width="13" height="17" viewBox="0 0 14 18"><path d="M1.68,16a5.6,5.6,0,0,0,.43.41A5.72,5.72,0,0,0,3,17a4.73,4.73,0,0,0,.74.39,5.08,5.08,0,0,0,.8.3,5.35,5.35,0,0,0,.69.17,8.62,8.62,0,0,0,.87.11h.84a8.46,8.46,0,0,0,.88-.11l.69-.17a7.14,7.14,0,0,0,.81-.31q.38-.18.72-.39a6.57,6.57,0,0,0,.9-.67,5.14,5.14,0,0,0,.41-.4A6.3,6.3,0,0,0,13,11.67a8.86,8.86,0,0,0-.09-1.21c0-.31-.1-.64-.17-1s-.2-.85-.33-1.29-.3-.93-.48-1.39-.33-.81-.51-1.2c-.1-.2-.19-.39-.29-.58L11,4.72c-.18-.33-.4-.69-.64-1s-.4-.55-.62-.82A4.41,4.41,0,0,0,6.5,1,4.41,4.41,0,0,0,3.29,2.86a9.15,9.15,0,0,0-.61.82c-.24.34-.44.68-.62,1L1.87,5l-.33.66c-.16.36-.32.72-.46,1.09S.74,7.7.61,8.16a13.14,13.14,0,0,0-.34,1.3,10,10,0,0,0-.18,1A8.47,8.47,0,0,0,0,11.67a6.29,6.29,0,0,0,.89,3.25A6.63,6.63,0,0,0,1.68,16ZM1.27,14.8a.7.7,0,0,1,.4.38,1.4,1.4,0,0,1,.09.29A6.38,6.38,0,0,1,1.27,14.8Zm1,1.15c.17-.14.46,0,.66.32a1.41,1.41,0,0,1,.14.31A5.55,5.55,0,0,1,2.22,16Zm1.41,1a.44.44,0,0,1,.2-.39c.22-.11.52.1.67.46a1.28,1.28,0,0,1,.09.32A6.22,6.22,0,0,1,3.63,16.94Zm1.58.55a.47.47,0,0,1,.27-.4c.22-.06.46.16.57.51A7.4,7.4,0,0,1,5.21,17.49ZM7,17.6c.11-.35.35-.57.57-.51a.49.49,0,0,1,.27.39A5.66,5.66,0,0,1,7,17.6Zm1.46-.28A1.18,1.18,0,0,1,8.52,17c.16-.36.46-.57.67-.46a.43.43,0,0,1,.2.38A7.27,7.27,0,0,1,8.44,17.32ZM10,16.56a.84.84,0,0,1,.13-.29c.19-.31.47-.44.65-.33A7.57,7.57,0,0,1,10,16.56Zm1.26-1.14a.75.75,0,0,1,.08-.24.72.72,0,0,1,.36-.37A6.76,6.76,0,0,1,11.28,15.42Zm1.06-6q.11.51.18,1a.73.73,0,0,1-.37-.4A.44.44,0,0,1,12.34,9.45ZM10.49,4.67l.3.54c.11.2.21.41.31.63a.85.85,0,0,1-.65-.4C10.24,5.12,10.26,4.78,10.49,4.67Zm-.41,2.2c-.25.09-.58-.12-.74-.46s-.09-.68.16-.76a.69.69,0,0,1,.74.46C10.4,6.45,10.33,6.79,10.08,6.87ZM7.22,1.49a3.3,3.3,0,0,1,1,.51.5.5,0,0,1-.14.59.68.68,0,0,1-.86-.28A.61.61,0,0,1,7.22,1.49Zm-2.39.45a3.34,3.34,0,0,1,1-.46.6.6,0,0,1,0,.83A.66.66,0,0,1,5,2.59.53.53,0,0,1,4.83,1.94ZM3.58,3.12a4.75,4.75,0,0,0,2.91.93A4.7,4.7,0,0,0,9.42,3.1c.24.3.47.62.68.92A4.5,4.5,0,0,1,6.49,5.39,4.46,4.46,0,0,1,2.9,4,9.35,9.35,0,0,1,3.58,3.12ZM7.93,7.54c-.29,0-.57-.25-.64-.64a.59.59,0,0,1,.38-.76c.29,0,.57.25.64.63S8.21,7.5,7.93,7.54Zm-2-.64c-.07.39-.36.67-.65.64s-.45-.38-.38-.77.36-.67.64-.63A.6.6,0,0,1,5.9,6.9Zm-3-.79a.69.69,0,0,1,.74-.46c.25.08.32.42.16.76s-.49.55-.74.46S2.78,6.45,2.94,6.11Zm-.73-.9c.08-.16.18-.33.28-.51.17.14.17.45,0,.74a.89.89,0,0,1-.57.39C2,5.62,2.1,5.41,2.21,5.21ZM1.38,7.08A7.89,7.89,0,0,0,6.52,8.7a7.91,7.91,0,0,0,5.11-1.6c.19.5.36,1,.5,1.52-1,1.2-3.11,2-5.61,2S1.83,9.8.88,8.58C1,8.09,1.19,7.58,1.38,7.08ZM11.55,11.5A.59.59,0,0,1,11,11a.46.46,0,0,1,.4-.57.59.59,0,0,1,.56.52A.47.47,0,0,1,11.55,11.5Zm-1.68.85a.6.6,0,0,1-.59-.5.45.45,0,0,1,.36-.59.62.62,0,0,1,.59.51A.45.45,0,0,1,9.87,12.35Zm-1.77,0a.56.56,0,0,1-.53.57.57.57,0,0,1-.51-.6.52.52,0,1,1,1,0Zm-2,0a.56.56,0,0,1-.5.6.59.59,0,0,1,0-1.17A.55.55,0,0,1,6.06,12.27Zm-2.21-.42a.61.61,0,0,1-.59.5.45.45,0,0,1-.36-.58.6.6,0,0,1,.59-.51A.46.46,0,0,1,3.85,11.85ZM2.13,11a.58.58,0,0,1-.56.52.46.46,0,0,1-.39-.57.59.59,0,0,1,.56-.52A.46.46,0,0,1,2.13,11ZM.65,9.48A.46.46,0,0,1,.78,10a.69.69,0,0,1-.29.36C.53,10.11.59,9.8.65,9.48ZM.38,11.67a4.84,4.84,0,0,1,0-.53c.74,1.68,3.19,3,6.1,3s5.33-1.32,6.09-3c0,.17,0,.35,0,.51a5.86,5.86,0,0,1-.39,2.11C11.21,15.09,9,16,6.51,16S1.75,15.06.75,13.73A5.84,5.84,0,0,1,.38,11.67Z"></path></svg>`;
const EVERY_LINK = ["", "index.php","forums.php#/p=threads&f=67&t=16326854&b=0&a=0","city.php","jobs.php","gym.php","properties.php","page.php?sid=education",
                    "crimes.php","loader.php?sid=missions","newspaper.php","jailview.php","hospitalview.php",
                    "casino.php","page.php?sid=hof","factions.php","competition.php","page.php?sid=list&type=friends",
                    "page.php?sid=list&type=enemies", "page.php?sid=list&type=targets","messages.php","page.php?sid=events","page.php?sid=awards","page.php?sid=points","rules.php",
                    "staff.php","credits.php","citystats.php","committee.php","bank.php","donator.php","item.php",
                    "page.php?sid=stocks","fans.php","museum.php","loader.php?sid=racing","church.php",
                    "dump.php","loan.php","page.php?sid=travel","amarket.php","bigalgunshop.php","shops.php?step=bitsnbobs",
                    "shops.php?step=cyberforce","shops.php?step=docks","shops.php?step=jewelry",
                    "shops.php?step=nikeh","shops.php?step=pawnshop","shops.php?step=pharmacy","pmarket.php",
                    "shops.php?step=postoffice","shops.php?step=super","shops.php?step=candy",
                    "shops.php?step=clothes","shops.php?step=recyclingcenter","shops.php?step=printstore","page.php?sid=ItemMarket","estateagents.php","bazaar.php?userId=1","page.php?sid=bazaar",
                    "calendar.php","token_shop.php","freebies.php","bringafriend.php","comics.php","archives.php","joblist.php",
                    "newspaper_class.php","personals.php",
                    "profiles.php?XID=1",
                    "newspaper.php#/archive","bounties.php","usersonline.php","joblist.php?step=search#!p=corpinfo&ID=79286","page.php?sid=log&otherUser=1468764","page.php?sid=ammo","playerreport.php",
                    "page.php?sid=itemsMods","displaycase.php","trade.php",
                    "crimes.php?step=criminalrecords","page.php?sid=factionWarfare#/dirty-bombs", "page.php?sid=crimesRecord",
                    "index.php?page=fortune","page.php?sid=bunker","church.php?step=proposals",
                    "messageinc.php","preferences.php","messageinc2.php#!p=main","page.php?sid=gallery&XID=1","personalstats.php?ID=1",
                    "properties.php?step=rentalmarket","properties.php?step=sellingmarket","forums.php","forums.php#!p=search&f=0&y=0&q=Heasley",
                    "page.php?sid=slots",
                    "page.php?sid=roulette","page.php?sid=highlow","page.php?sid=keno","page.php?sid=craps",
                    "page.php?sid=bookie","page.php?sid=lottery","page.php?sid=blackjack",
                    "page.php?sid=holdem","page.php?sid=russianRoulette","page.php?sid=spinTheWheel",
                    "page.php?sid=spinTheWheelLastSpins","page.php?sid=slotsStats",
                    "page.php?sid=slotsLastRolls","page.php?sid=rouletteStatistics","page.php?sid=rouletteLastSpins",
                    "page.php?sid=highlowStats","page.php?sid=highlowLastGames",
                    "page.php?sid=kenoStatistics","page.php?sid=kenoLastGames","page.php?sid=crapsStats",
                    "page.php?sid=crapsLastRolls","page.php?sid=bookie#/stats/","page.php?sid=lotteryTicketsBought",
                    "page.php?sid=lotteryPreviousWinners","page.php?sid=blackjackStatistics",
                    "page.php?sid=blackjackLastGames","page.php?sid=holdemStats",
                    "page.php?sid=russianRouletteStatistics","page.php?sid=russianRouletteLastGames",
                    "messageinc2.php#!p=viewall","bazaar.php#/add",
                    "bazaar.php#/personalize","factions.php?step=your#/tab=crimes",
                    "factions.php?step=your#/tab=rank","page.php?sid=events#onlySaved=true",
                    "factions.php?step=your#/tab=controls","factions.php?step=your#/tab=info","messages.php#/p=ignorelist",
                    "messages.php#/p=outbox","factions.php?step=your#/tab=upgrades",
                    "messages.php#/p=saved","messages.php#/p=compose","displaycase.php#add","displaycase.php#manage",
                    "factions.php?step=your#/tab=armoury","bazaar.php#/manage","companies.php",
                    "itemuseparcel.php","index.php?page=rehab","index.php?page=people",
                    "page.php?sid=UserList","index.php?page=hunting","donatordone.php","revive.php","pc.php",
                    "loader.php?sid=attackLog&ID=d684cb5d97aef79241bad8166619691b","loader.php?sid=attack&user2ID=1","loader.php?sid=crimes","loader.php?sid=crimes#/searchforcash",
                    "loader.php?sid=crimes#/bootlegging","loader.php?sid=crimes#/graffiti","loader.php?sid=crimes#/shoplifting",
                    "loader.php?sid=crimes#/pickpocketing","loader.php?sid=crimes#/cardskimming","loader.php?sid=crimes#/burglary","loader.php?sid=crimes#/hustling",
                    "loader.php?sid=crimes#/disposal","loader.php?sid=crimes#/cracking","loader.php?sid=crimes#/forgery","loader.php?sid=crimes#/scamming","page.php?sid=crimes#/arson",
                    "/war.php?step=rankreport&rankID=69","/war.php?step=warreport&warID=420","/war.php?step=raidreport&raidID=69",
                    "/war.php?step=chainreport&chainID=69420", "page.php?sid=keepsakes",
                    "page.php?sid=crimes2","authenticate.php"];

const FLOAT_POS_LABELS = ["bottom left", "top left", "bottom right", "top right"];

const eeeh_options_observer = new MutationObserver(() => {
    const url = window.location.href;
    if (url.includes("forums.php")) {
        if (url.includes("f=67&t=16326854") && $("li.parent-post[data-id=\"23383506\"]").length) {
            if (jQueryLoaded()) { // Double check jQuery has loaded for TornPDA to stop being a whiny piece of shit
                if (!document.getElementsByClassName("eeh-options").length) insertOptions();
                eeeh_options_observer.disconnect();
            }
        }
    } else {
        eeeh_options_observer.disconnect();
    }
});

const eeh_preferences_observer = new MutationObserver(() => {
    const url = window.location.href;
    if (!url.includes("preferences.php")) return;
    if (!jQueryLoaded()) return;
    if (document.getElementById("eeh-preferences-panel")) {
        eeh_preferences_observer.disconnect();
        return;
    }
    if (!document.getElementById("prefs-tab-menu")) return;
    insertPrefsPanel();
    eeh_preferences_observer.disconnect();
});

const eeeh_observer = new MutationObserver(() => {
    if (document.getElementById("eggTraverse")) {
        eeeh_observer.disconnect();
        return;
    }
    if (!jQueryLoaded()) return; // Double check jQuery has loaded for TornPDA to stop being a whiny piece of shit
    if (ButtonFloat) {
        // Insert into sidebar
        if (document.querySelector("#sidebar > div:first-of-type")) {
            insertNormal(); // Insert normal sidebar version
            eeeh_observer.disconnect();
        }
    } else if (document.body) {
        //insert floating button
        insertFloat();
        eeeh_observer.disconnect();
    }
});

window.addEventListener("hashchange", hashChanged, false);
window.addEventListener("resize", queueClampFloatOnResize, false);
window.addEventListener("orientationchange", queueClampFloatOnResize, false);
if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", queueClampFloatOnResize, false);
}

eeeh_observer.observe(document, obs_ops);
eeeh_options_observer.observe(document, obs_ops);
eeh_preferences_observer.observe(document, obs_ops);

function hashChanged() {
    const pageUrl = window.location.href;
    if (pageUrl.includes("forums.php")) eeeh_options_observer.observe(document, obs_ops);
    if (pageUrl.includes("preferences.php") && !document.getElementById("eeh-preferences-panel")) {
        eeh_preferences_observer.observe(document, obs_ops);
    }
    if (eeh_is_disabled) {
        setTimeout(() => {
            eeh_is_disabled = false;
        }, 1000);
    }
}

function eggLinkText(eggButtonType) {
    if (!eeh_show_page_numbers) {
        return eggButtonType === "float" ? "" : "Egg Navigator";
    }
    return eggButtonType === "float" ? String(linkIndex) : `Egg Navigator (${linkIndex}/${EVERY_LINK.length})`;
}

function updateEggLabels(eggButtonType) {
    const eggTraverse = $("#eggTraverse");
    if (!eggTraverse.length) return;
    eggTraverse.find(".eeh-name").text(eggLinkText(eggButtonType));
    if (eggButtonType === "float") {
        eggTraverse.toggleClass("eeh-hide-page-nums", !eeh_show_page_numbers);
        eggTraverse.find(".eeh-total").text(eeh_show_page_numbers ? String(EVERY_LINK.length) : "");
    } else {
        eggTraverse.removeClass("eeh-hide-page-nums");
    }
    if (eggButtonType === "float" && eeh_show_page_numbers) ensureFloatOnScreenAfterLayout();
}

function setEggTraverseClickEvent(eggButtonType) {
    const eggTraverse = $("#eggTraverse");
    const eggIcon = eggTraverse.find(".eeh-icon");
    eggTraverse
        .on("mousedown touchstart", () => {
            if (eeh_drag_state) return;
            eeh_anim_pressTimer = window.setTimeout(() => {
                if (eeh_drag_state) return;
                eeh_holding = true;
                eggIcon.fadeOut(eeh_reset_time);
                eeh_pressTimer = window.setTimeout(() => {
                    if (eeh_holding && !eeh_drag_state) {
                        linkIndex = 0;
                        eggIcon.fadeIn(eeh_fade_in);
                        saveEehStore();
                        eggTraverse.attr("href", EVERY_LINK[0]);
                        updateEggLabels(eggButtonType);
                    }
                }, eeh_reset_time);
            }, eeh_fade_in);
        })
        .on("mouseup touchend mouseleave", () => {
            clearTimeout(eeh_anim_pressTimer);
            if (eeh_holding) {
                clearTimeout(eeh_pressTimer);
                eeh_holding = false;
                eggIcon.stop(true, true).fadeIn(eeh_fade_in);
            }
        })
        .contextmenu((e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        })
        .on("click", (e) => {
            if (eeh_drag_state) return;
            if (eeh_holding) {
                eeh_holding = false;
                eggIcon.stop(true, true).fadeIn(eeh_fade_in);
            }
            if (e.ctrlKey || (e.originalEvent && e.originalEvent.ctrlKey)) {
                //ctrl was held down during the click
                incrementEggTraverse(eggButtonType);
            } else {
                //normal click
                if (!eeh_is_disabled) {
                    eeh_is_disabled = true;
                    incrementEggTraverse(eggButtonType);
                } else {
                    e.preventDefault();
                }
            }
        });
}

function incrementEggTraverse(eggButtonType) {
    const eggTraverse = $("#eggTraverse");
    linkIndex = (linkIndex + 1) % EVERY_LINK.length;
    saveEehStore();
    eggTraverse.attr("href", EVERY_LINK[linkIndex]);
    updateEggLabels(eggButtonType);
}

// After storage or cross-tab updates - point the link at EVERY_LINK[linkIndex] and refresh the visible label text.
function syncEggFromStore() {
    const eggLink = document.getElementById("eggTraverse");
    if (!eggLink) return;
    eggLink.setAttribute("href", EVERY_LINK[linkIndex]);
    updateEggLabels(eggLink.classList.contains("eeh-float") ? "float" : "sidebar");
}

function insertNormal() {
    console.log("[Heasley][Egg Navigator] Inserting to sidebar...");
    if (!document.getElementById("eggTraverse")) {
        let href = EVERY_LINK[linkIndex];

        const sidebarEggHtml = `
            <div class="eeh-link">
                <a href="${href}" id="eggTraverse">
                    <span class="eeh-icon">${easteregg_svg}</span>
                    <span class="eeh-name">${eggLinkText("sidebar")}</span>
                </a>
            </div>`.replace(/>\s+</g, "><");

        const sidebar = document.getElementById("sidebar");
        if (sidebar.firstChild) {
            // Insert the easterspans HTML string after the first child element of sidebar
            $("#sidebar > *").first().after(sidebarEggHtml);
            setEggTraverseClickEvent("sidebar");
        }
        insertStyle();
    }
    eeeh_observer.disconnect(); //disconnect observer AGAIN so TornPDA stops checking this.
}

function insertFloat() {
    console.log("[Heasley][Egg Navigator] Inserting floating button...");
    if (!document.getElementById("eggTraverse")) {
        let href = EVERY_LINK[linkIndex];
        const floatNumClass = eeh_show_page_numbers ? "eeh-float" : "eeh-float eeh-hide-page-nums";
        const floatWrapHtml = `
            <div id="eeh-float-wrap" class="eeh-float-wrap">
                <button type="button" id="eeh-drag-handle" class="eeh-drag-handle" aria-label="Move floating button">\u22ee</button>
                <a href="${href}" id="eggTraverse" class="${floatNumClass}">
                    <span class="eeh-icon">${easteregg_svg}</span>
                    <span class="eeh-wrap">
                        <span class="eeh-name">${eeh_show_page_numbers ? linkIndex : ""}</span>
                        <span class="eeh-total">${eeh_show_page_numbers ? EVERY_LINK.length : ""}</span>
                    </span>
                </a>
            </div>`.replace(/>\s+</g, "><");

        $("body").append(floatWrapHtml);

        insertStyle();
        setFloatPosition();
        setEggTraverseClickEvent("float");
        if (eeh_show_page_numbers) {
            ensureFloatOnScreenAfterLayout();
        }
    }
    eeeh_observer.disconnect(); //disconnect observer AGAIN so TornPDA stops checking this.
}

function insertOptions() {
    console.log("[Heasley][Egg Navigator] Inserting options...");
    if (!document.getElementsByClassName("eeh-options").length) {
        const post = $("li.parent-post[data-id=\"23383506\"]").find("div.post-container div.post");
        let enabled_float = ButtonFloat ? "disabled" : "enabled";
        let enabledClass_float = ButtonFloat ? "eeh-red" : "eeh-green";

        const enabled_float_pos = FLOAT_POS_LABELS[ButtonFloatPos] || FLOAT_POS_LABELS[0];

        post.before(`
            <div class="eeh-control-panel">
                <h1 class="eeh-head">Heasley's Egg Navigator</h1>
                <p class="eeh-subline">CONTROL PANEL</p>
                <hr class="eeh-divider">
                <div class="eeh-options">
                    <button id="eeh-float-toggle">Toggle float button</button>
                    <p>FLOAT BUTTON: <span id="eeh-float-toggle-label" class="${enabledClass_float}">${enabled_float}</span></p>
                </div>
                <div class="eeh-options">
                    <button id="eeh-float-pos-toggle">Toggle position</button>
                    <p>FLOAT POSITION: <span id="eeh-float-pos-toggle-label">${enabled_float_pos}</span></p>
                </div>
            </div>`.replace(/>\s+</g, "><"));

        $("#eeh-float-toggle").click(function () {
            const label = $("#eeh-float-toggle-label");
            if (toggleFloatButton()) {
                label.text("disabled");
            } else {
                label.text("enabled");
            }
            label.toggleClass("eeh-green eeh-red");
            syncPrefsPanel();
        });

        $("#eeh-float-pos-toggle").click(function () {
            const label = $("#eeh-float-pos-toggle-label");
            const pos = toggleFloatPosition();
            label.text(pos !== undefined ? FLOAT_POS_LABELS[pos] || "disabled" : "disabled");
            syncPrefsPanel();
        });
        eeeh_options_observer.disconnect();
    }
}

// If the prefs panel is open, make checkboxes/radios reflect what's in memory after load or remote change.
function syncPrefsPanel() {
    const panelRoot = document.getElementById("eeh-preferences-panel");
    if (!panelRoot) return;
    const floatToggle = document.getElementById("eeh-prefs-float-enabled");
    if (floatToggle) floatToggle.checked = ButtonFloat === 0;
    const dragToggle = document.getElementById("eeh-prefs-float-drag");
    if (dragToggle) dragToggle.checked = !!eeh_float_drag;
    const numToggle = document.getElementById("eeh-prefs-show-page-numbers");
    if (numToggle) numToggle.checked = !!eeh_show_page_numbers;
    const cornerRadios = panelRoot.querySelectorAll('input[name="eeh-prefs-corner"]');
    for (const radio of cornerRadios) {
        radio.checked = String(ButtonFloatPos) === radio.value;
    }
    const holdMsInput = document.getElementById("eeh-prefs-reset-hold-ms");
    if (holdMsInput) holdMsInput.value = String(eeh_reset_time);
}

// One-time hooks on the real preferences UI - float vs sidebar, drag, corner radios.
function bindPrefsPanel() {
    const panelRoot = document.getElementById("eeh-preferences-panel");
    if (!panelRoot) return;

    $("#eeh-prefs-float-enabled")
        .off("change.eehprefs")
        .on("change.eehprefs", function () {
            setEggBarDock(!this.checked);
        });

    $("#eeh-prefs-show-page-numbers")
        .off("change.eehprefs")
        .on("change.eehprefs", function () {
            eeh_show_page_numbers = !!this.checked;
            saveEehStore();
            if (document.getElementById("eggTraverse")) {
                const isFloat = document.getElementById("eggTraverse").classList.contains("eeh-float");
                updateEggLabels(isFloat ? "float" : "sidebar");
            }
            if (!eeh_show_page_numbers && !eeh_float_drag) {
                eeh_float_x = null;
                eeh_float_y = null;
                saveEehStore();
                setFloatPosition();
            }
        });

    $("#eeh-prefs-float-drag")
        .off("change.eehprefs")
        .on("change.eehprefs", function () {
            eeh_float_drag = !!this.checked;
            if (!eeh_float_drag) {
                eeh_float_x = null;
                eeh_float_y = null;
            }
            saveEehStore();
            setFloatPosition();
        });

    $(panelRoot)
        .find('input[name="eeh-prefs-corner"]')
        .off("change.eehprefs")
        .on("change.eehprefs", function () {
            if (!this.checked) return;
            ButtonFloatPos = parseInt(this.value, 10);
            if (Number.isNaN(ButtonFloatPos)) ButtonFloatPos = 0;
            if (ButtonFloatPos >= 4) ButtonFloatPos = 0;
            eeh_float_x = null;
            eeh_float_y = null;
            saveEehStore();
            setFloatPosition();
        });

    $("#eeh-prefs-reset-hold-ms")
        .off("change.eehprefs blur.eehprefs")
        .on("change.eehprefs blur.eehprefs", function () {
            const v = clampResetHoldMs(this.value);
            this.value = String(v);
            eeh_reset_time = v;
            saveEehStore();
        });

    syncPrefsPanel();
}

// Sidebar mode = ButtonFloat 1, floating = 0...if we're already on the right mode and the DOM matches, bail early.
function setEggBarDock(isSidebar) {
    const nextMode = isSidebar ? 1 : 0;
    if (ButtonFloat === nextMode) {
        const buttonAlreadyPresent = nextMode === 1
            ? !!document.getElementById("eggTraverse")
            : !!document.getElementById("eeh-float-wrap");
        if (buttonAlreadyPresent) return;
    }
    killButton();
    ButtonFloat = nextMode;
    if (ButtonFloat) insertNormal();
    else insertFloat();
    saveEehStore();
    syncPrefsPanel();
    if (!nextMode) {
        setFloatPosition();
    }
}

// Keep the whole float strip inside the visible viewport - uses layout width/height so clamp matches what you see.
function clampWrapInViewport(wrapElement, left, top) {
    const bounds = wrapElement.getBoundingClientRect();
    const width = bounds.width || wrapElement.offsetWidth;
    const height = bounds.height || wrapElement.offsetHeight;
    const { w: viewportWidth, h: viewportHeight } = viewportInnerSize();
    const maxLeft = Math.max(0, viewportWidth - width);
    const maxTop = Math.max(0, viewportHeight - height);
    return {
        left: Math.round(Math.min(Math.max(0, left), maxLeft)),
        top: Math.round(Math.min(Math.max(0, top), maxTop)),
    };
}

// After page numbers widen the float, corner CSS can leave it past an edge - snap to clamped left/top and persist.
function ensureFloatOnScreen() {
    if (ButtonFloat !== 0 || !eeh_show_page_numbers) return;
    const w = document.getElementById("eeh-float-wrap");
    if (!w) return;
    const r = w.getBoundingClientRect();
    const c = clampWrapInViewport(w, Math.round(r.left), Math.round(r.top));
    if (Math.abs(c.left - r.left) < 1 && Math.abs(c.top - r.top) < 1) return;
    w.classList.remove("eeh-float-bottom", "eeh-float-top", "eeh-float-left", "eeh-float-right");
    w.classList.add("eeh-float-custom");
    applyWrapPositionPx(w, c.left, c.top, true);
    eeh_float_x = c.left;
    eeh_float_y = c.top;
    updateHandleSide(w);
    if (jQueryLoaded()) bindFloatDrag();
    saveEehStore();
}

function ensureFloatOnScreenAfterLayout() {
    requestAnimationFrame(() => requestAnimationFrame(ensureFloatOnScreen));
}

function queueClampFloatOnResize() {
    if (ButtonFloat !== 0) return;
    if (eeh_resize_raf != null) return;
    eeh_resize_raf = requestAnimationFrame(() => {
        eeh_resize_raf = null;
        clampFloatOnResize();
    });
}

// Keep the floating bar inside the viewport after window resize (custom coords, corner CSS, or wider bar with page numbers).
function clampFloatOnResize() {
    if (ButtonFloat !== 0) return;
    if (eeh_drag_state) return;
    const w = document.getElementById("eeh-float-wrap");
    if (!w) return;

    let left;
    let top;
    if (eeh_float_x != null && eeh_float_y != null) {
        left = eeh_float_x;
        top = eeh_float_y;
    } else {
        const r = w.getBoundingClientRect();
        left = Math.round(r.left);
        top = Math.round(r.top);
    }
    const c = clampWrapInViewport(w, left, top);
    if (c.left !== left || c.top !== top) {
        w.classList.remove("eeh-float-bottom", "eeh-float-top", "eeh-float-left", "eeh-float-right");
        w.classList.add("eeh-float-custom");
        applyWrapPositionPx(w, c.left, c.top, true);
        eeh_float_x = c.left;
        eeh_float_y = c.top;
        updateHandleSide(w);
        if (jQueryLoaded()) bindFloatDrag();
        saveEehStore();
    }
    if (eeh_show_page_numbers) {
        ensureFloatOnScreenAfterLayout();
    }
}

// Which side of the pill the drag handle sits on - from viewport center when user has a custom position, else from corner preset.
function updateHandleSide(wrap) {
    if (!wrap) return;
    if (!eeh_float_drag) {
        wrap.classList.remove("eeh-handle-left", "eeh-handle-right");
        return;
    }
    let handleOnRightOfPill;
    if (eeh_float_x != null && eeh_float_y != null) {
        const viewportWidth = viewportInnerSize().w;
        const wrapBounds = wrap.getBoundingClientRect();
        if (wrapBounds.width > 0 && viewportWidth > 0) {
            const centerX = wrapBounds.left + wrapBounds.width / 2;
            handleOnRightOfPill = centerX < viewportWidth / 2;
        } else {
            handleOnRightOfPill = ButtonFloatPos === 0 || ButtonFloatPos === 1;
        }
    } else {
        handleOnRightOfPill = ButtonFloatPos === 0 || ButtonFloatPos === 1;
    }
    wrap.classList.remove("eeh-handle-left", "eeh-handle-right");
    wrap.classList.add(handleOnRightOfPill ? "eeh-handle-right" : "eeh-handle-left");
    if (wrap.classList.contains("eeh-float-custom") && eeh_float_x != null && eeh_float_y != null) {
        wrap.classList.remove("eeh-float-left", "eeh-float-right");
        wrap.classList.add(handleOnRightOfPill ? "eeh-float-left" : "eeh-float-right");
    }
}

function onFloatDragMove(e) {
    if (!eeh_drag_state) return;
    e.preventDefault();
    const nativeEvent = e.originalEvent || e;
    const touch = (nativeEvent.touches && nativeEvent.touches[0]) || (nativeEvent.changedTouches && nativeEvent.changedTouches[0]);
    const pointerX = touch ? touch.clientX : e.clientX;
    const pointerY = touch ? touch.clientY : e.clientY;
    if (pointerX == null) return;
    const wrapElement = eeh_drag_state.wrapElement;
    const nextLeft = Math.round(pointerX - eeh_drag_state.grabOffsetX);
    const nextTop = Math.round(pointerY - eeh_drag_state.grabOffsetY);
    const clamped = clampWrapInViewport(wrapElement, nextLeft, nextTop);
    // Re-base grab point from clamped top-left each frame so sliding along an edge doesn't corrupt offset.
    eeh_drag_state.grabOffsetX = pointerX - clamped.left;
    eeh_drag_state.grabOffsetY = pointerY - clamped.top;
    applyWrapPositionPx(wrapElement, clamped.left, clamped.top, false);
    eeh_float_x = clamped.left;
    eeh_float_y = clamped.top;
    if (!eeh_drag_persist_raf) {
        eeh_drag_persist_raf = requestAnimationFrame(() => {
            eeh_drag_persist_raf = null;
            if (eeh_drag_state) saveEehStore();
        });
    }
}

function onFloatDragEnd() {
    if (eeh_drag_persist_raf) {
        cancelAnimationFrame(eeh_drag_persist_raf);
        eeh_drag_persist_raf = null;
    }
    $(document).off("mousemove.eehdrag touchmove.eehdrag mouseup.eehdrag touchend.eehdrag touchcancel.eehdrag");
    if (!eeh_drag_state) return;
    const wrapElement = eeh_drag_state.wrapElement;
    const bounds = wrapElement.getBoundingClientRect();
    const clamped = clampWrapInViewport(wrapElement, bounds.left, bounds.top);
    eeh_float_x = clamped.left;
    eeh_float_y = clamped.top;
    applyWrapPositionPx(wrapElement, clamped.left, clamped.top, false);
    updateHandleSide(wrapElement);
    saveEehStore();
    eeh_drag_state = null;
}

// (Re)attach handle listeners after DOM rebuilds...namespaced so we don't stack duplicate handlers.
function bindFloatDrag() {
    const $floatWrap = $("#eeh-float-wrap");
    const $dragHandle = $("#eeh-drag-handle");
    $dragHandle.off("mousedown.eehdrag touchstart.eehdrag");
    $floatWrap.removeClass("eeh-drag-active eeh-handle-left eeh-handle-right");
    if (!eeh_float_drag || !$floatWrap.length) return;

    $floatWrap.addClass("eeh-drag-active");
    updateHandleSide($floatWrap[0]);
    $dragHandle.on("mousedown.eehdrag touchstart.eehdrag", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "mousedown" && e.which !== 1) return;
        const wrapElement = $floatWrap[0];
        const pointer = e.originalEvent && e.originalEvent.touches ? e.originalEvent.touches[0] : e;
        const startBounds = wrapElement.getBoundingClientRect();
        const clampedStart = clampWrapInViewport(wrapElement, startBounds.left, startBounds.top);
        eeh_float_x = clampedStart.left;
        eeh_float_y = clampedStart.top;
        wrapElement.classList.remove("eeh-float-bottom", "eeh-float-top");
        wrapElement.classList.add("eeh-float-custom");
        applyWrapPositionPx(wrapElement, clampedStart.left, clampedStart.top, true);
        saveEehStore();
        updateHandleSide(wrapElement);
        const boundsAfterSync = wrapElement.getBoundingClientRect();
        clearTimeout(eeh_anim_pressTimer);
        clearTimeout(eeh_pressTimer);
        if (eeh_holding) {
            eeh_holding = false;
            $("#eggTraverse .eeh-icon").stop(true, true).fadeIn(eeh_fade_in);
        }
        eeh_drag_state = {
            wrapElement: wrapElement,
            grabOffsetX: pointer.clientX - boundsAfterSync.left,
            grabOffsetY: pointer.clientY - boundsAfterSync.top,
        };
        $(document).on("mousemove.eehdrag touchmove.eehdrag", onFloatDragMove);
        $(document).on("mouseup.eehdrag touchend.eehdrag touchcancel.eehdrag", onFloatDragEnd);
    });
}

// Make the live page match ButtonFloat - inject sidebar vs float, or just refresh href/label if the right shell is already there.
function syncEggUi() {
    if (!jQueryLoaded()) return;

    const useSidebar = ButtonFloat === 1;
    const floatWrap = document.getElementById("eeh-float-wrap");
    const eggLink = document.getElementById("eggTraverse");

    if (useSidebar) {
        if (!eggLink) {
            if (document.querySelector("#sidebar > div:first-of-type")) insertNormal();
        } else if (floatWrap) {
            killButton();
            if (document.querySelector("#sidebar > div:first-of-type")) insertNormal();
        } else {
            syncEggFromStore();
        }
    } else {
        if (!eggLink) {
            if (document.body) insertFloat();
        } else if (!floatWrap) {
            killButton();
            if (document.body) insertFloat();
        } else {
            syncEggFromStore();
            setFloatPosition();
        }
    }
}

// Apply eeh-store payload (storage sync or key cleared)...if we're dragging, ignore so the bar doesn't jump.
function mergeRemoteStore(newValue) {
    if (eeh_drag_state) return;
    if (newValue == null) {
        loadEehStore();
        syncPrefsPanel();
        syncEggUi();
        return;
    }
    let normalized;
    try {
        normalized = parseEehStore(JSON.parse(newValue));
    } catch {
        return;
    }
    applyStoreToGlobals(normalized);
    syncPrefsPanel();
    syncEggUi();
}

window.addEventListener("storage", (storageEvent) => {
    if (storageEvent.key !== EEH_STORE_KEY || storageEvent.storageArea !== localStorage) return;
    mergeRemoteStore(storageEvent.newValue);
}, false);

// Drop our block under Torn's prefs menu - float/sidebar lives next to real settings instead of a forum post.
function insertPrefsPanel() {
    if (!jQueryLoaded()) return;
    if (document.getElementById("eeh-preferences-panel")) return;

    insertStyle();

    const $menu = $("#prefs-tab-menu");
    if (!$menu.length) return;

    const $mainWrap = $menu.closest(".preferences-wrap");
    if (!$mainWrap.length) return;

    const panelHtml = `
        <div id="eeh-preferences-panel" class="preferences-wrap cont-gray border-round eeh-prefs-wrap">
            <div class="eeh-prefs-tab-title title-black top-round">Heasley's Egg Navigator</div>
            <div class="border-round ui-widget-content ui-corner-bottom eeh-prefs-inner">
                <div class="eeh-prefs-section">
                    <p class="eeh-prefs-heading t-gray-6 bold">Floating button</p>
                    <div class="m-top10 m-bottom10">
                        <input class="checkbox-css" type="checkbox" id="eeh-prefs-float-enabled" name="eeh-prefs-float-enabled">
                        <label for="eeh-prefs-float-enabled" class="marker-css">Use floating button (off = sidebar)</label>
                    </div>
                    <div class="m-top10 m-bottom10">
                        <input class="checkbox-css" type="checkbox" id="eeh-prefs-show-page-numbers" name="eeh-prefs-show-page-numbers">
                        <label for="eeh-prefs-show-page-numbers" class="marker-css">Show page numbers</label>
                    </div>
                </div>
                <div class="eeh-prefs-section">
                    <p class="eeh-prefs-heading t-gray-6 bold">Egg button</p>
                    <div class="m-top10 m-bottom10">
                        <label for="eeh-prefs-reset-hold-ms" class="marker-css">Reset hold duration (ms)</label>
                        <input type="number" class="text" id="eeh-prefs-reset-hold-ms" name="eeh-prefs-reset-hold-ms" min="500" max="120000" step="100">
                    </div>
                </div>
                <div class="eeh-prefs-section">
                    <p class="eeh-prefs-heading t-gray-6 bold">Position</p>
                    <div class="m-top10 m-bottom10">
                        <input class="checkbox-css" type="checkbox" id="eeh-prefs-float-drag" name="eeh-prefs-float-drag">
                        <label for="eeh-prefs-float-drag" class="marker-css">Enable dragging (use handle beside button)</label>
                    </div>
                    <ul class="eeh-prefs-list" role="radiogroup">
                        <li class="m-bottom5">
                            <input id="eeh-prefs-corner-bl" class="radio-css" type="radio" name="eeh-prefs-corner" value="0">
                            <label for="eeh-prefs-corner-bl" class="marker-css">Bottom left</label>
                        </li>
                        <li class="m-bottom5">
                            <input id="eeh-prefs-corner-tl" class="radio-css" type="radio" name="eeh-prefs-corner" value="1">
                            <label for="eeh-prefs-corner-tl" class="marker-css">Top left</label>
                        </li>
                        <li class="m-bottom5">
                            <input id="eeh-prefs-corner-br" class="radio-css" type="radio" name="eeh-prefs-corner" value="2">
                            <label for="eeh-prefs-corner-br" class="marker-css">Bottom right</label>
                        </li>
                        <li class="m-bottom5">
                            <input id="eeh-prefs-corner-tr" class="radio-css" type="radio" name="eeh-prefs-corner" value="3">
                            <label for="eeh-prefs-corner-tr" class="marker-css">Top right</label>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
        <div class="clear"></div>`.replace(/>\s+</g, "><");

    $mainWrap.after(panelHtml);

    bindPrefsPanel();

    console.log("[Heasley][Egg Navigator] Preferences panel inserted.");
}

function insertStyle() {
    if (eeh_styles_injected) return;
    eeh_styles_injected = true;
    GM.addStyle(`
.eeh-link {
  background-color: var(--default-bg-panel-color);
  cursor: pointer;
  overflow: hidden;
  vertical-align: top;
  border-bottom-right-radius: 5px;
  border-top-right-radius: 5px;
  margin-top: 2px;
  height: 23px;
  margin-bottom: 2px;
}

.eeh-link:hover {
  background-color: var(--default-bg-panel-active-color);
}

.eeh-link a {
  display: flex;
  -ms-align-items: center;
  align-items: center;
  color: var(--default-color);
  text-decoration: none;
  height: 100%;
}

.eeh-link a .eeh-icon {
  float: left;
  width: 34px;
  height: 23px;
  display: flex;
  -ms-align-items: center;
  align-items: center;
  justify-content: center;
  margin-left: 0;
}

.eeh-link a .eeh-icon {
  stroke: transparent;
  stroke-width: 0;
}

.eeh-link a .eeh-name {
  line-height: 22px;
  padding-top: 1px;
  overflow: hidden;
  max-width: 134px;
}

#eggTraverse.eeh-float.eeh-hide-page-nums .eeh-wrap {
  display: none;
}

.eeh-float .eeh-wrap {
  font-size: 12px;
}

.eeh-float .eeh-wrap .eeh-name {
  margin-bottom: -2px;
  text-align: center;
  align-self: stretch;
}

.eeh-float .eeh-wrap .eeh-total {
  border-top: 1px var(--default-color) solid;
  padding-top: 0;
  text-align: center;
  align-self: stretch;
}

.eeh-float .eeh-wrap {
  display: flex;
  flex-wrap: wrap;
  flex-direction: column;
  align-items: stretch;
}

#eeh-float-wrap.eeh-float-wrap {
    position: fixed;
    z-index: 999999;
    display: flex;
    align-items: stretch;
    flex-direction: row;
}

#eeh-float-wrap.eeh-float-top { top: 80px; }
#eeh-float-wrap.eeh-float-bottom { bottom: 80px; }
#eeh-float-wrap.eeh-float-left { left: 0; }
#eeh-float-wrap.eeh-float-right { right: 0; }

.eeh-drag-handle {
    display: none;
    width: 22px;
    min-width: 22px;
    box-sizing: border-box;
    margin: 0;
    padding: 0 5px;
    border: 1px solid var(--default-panel-divider-outer-side-color);
    background: var(--info-msg-bg-gradient);
    box-shadow: var(--default-tabs-box-shadow);
    cursor: move;
    color: var(--default-color);
    text-shadow: var(--default-tabs-text-shadow);
    font: 700 16px/1 arial;
    align-items: center;
    justify-content: center;
    user-select: none;
    -webkit-user-select: none;
}

#eeh-float-wrap.eeh-drag-active .eeh-drag-handle {
    display: flex;
}

/* handle left of pill: drag right edge flat, pill left edge flat + no border on seam */
#eeh-float-wrap.eeh-drag-active.eeh-handle-left .eeh-drag-handle {
    order: 1;
    border-radius: 5px 0 0 5px;
    border-right: 1px solid var(--default-panel-divider-outer-side-color);
}
#eeh-float-wrap.eeh-drag-active.eeh-handle-left #eggTraverse.eeh-float {
    order: 2;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: none;
    justify-content: flex-start;
    padding: 10px;
}

/* handle right of pill: drag left edge flat, pill right edge flat + no border on seam */
#eeh-float-wrap.eeh-drag-active.eeh-handle-right .eeh-drag-handle {
    order: 2;
    border-radius: 0 5px 5px 0;
    border-left: 1px solid var(--default-panel-divider-outer-side-color);
}
#eeh-float-wrap.eeh-drag-active.eeh-handle-right #eggTraverse.eeh-float {
    order: 1;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-right: none;
    justify-content: flex-end;
    padding: 10px;
}

#eeh-float-wrap.eeh-float-left .eeh-float .eeh-wrap {
  margin-right: 0;
  order: 1;
}

#eeh-float-wrap.eeh-float-left .eeh-float .eeh-icon {
  order: 2;
}

#eeh-float-wrap.eeh-float-right .eeh-float .eeh-wrap {
  margin-left: 0;
  order: 2;
}

#eeh-float-wrap.eeh-float-right .eeh-float .eeh-icon {
  order: 1;
}

.eeh-float .eeh-icon svg {
  width: 20px !important;
  height: 26px !important;
}

#eggTraverse.eeh-float {
    height: 40px;
    cursor: pointer;
    padding: 10px 15px 10px 15px;
    box-sizing: border-box;
    border: 1px solid var(--default-panel-divider-outer-side-color);
    box-shadow: 0 2px 12px 0 rgba(0,0,0,.1);
    display: flex;
    align-items: center;
    gap: 7px;
    text-shadow: var(--default-tabs-text-shadow);
    background: var(--info-msg-bg-gradient);
    box-shadow: var(--default-tabs-box-shadow);
    border-radius: 5px;
    overflow: hidden;
    font-size: 15px;
    font-weight: 700;
    line-height: 18px;
    font-family: arial;
    color: var(--default-color);
    text-decoration: none;
}

#eeh-float-wrap.eeh-float-left #eggTraverse.eeh-float {
    padding: 10px;
    justify-content: right;
}

#eeh-float-wrap.eeh-float-right #eggTraverse.eeh-float {
    padding: 10px;
    justify-content: left;
}

#eeh-float-wrap.eeh-float-custom #eggTraverse.eeh-float {
    padding: 10px;
}

/* drag on: left half (handle-right) = numbers left, egg right; right half (handle-left) = egg left, numbers right */
#eeh-float-wrap.eeh-drag-active.eeh-handle-right #eggTraverse.eeh-float .eeh-wrap {
    order: 1;
    margin-right: 0;
    margin-left: 0;
}
#eeh-float-wrap.eeh-drag-active.eeh-handle-right #eggTraverse.eeh-float .eeh-icon {
    order: 2;
    margin-left: 0;
    margin-right: 0;
}

#eeh-float-wrap.eeh-drag-active.eeh-handle-left #eggTraverse.eeh-float .eeh-icon {
    order: 1;
    margin-left: 0;
    margin-right: 0;
}
#eeh-float-wrap.eeh-drag-active.eeh-handle-left #eggTraverse.eeh-float .eeh-wrap {
    order: 2;
    margin-left: 0;
    margin-right: 0;
}

[class*='topSection_'] .eeh-icon-svg-wrap {
    position: absolute;
    -ms-transform: translate(-120%, 10%);
    transform: translate(-120%, 10%);
}

.content-wrapper > #easterrandom .eeh-icon-svg-wrap {
    position: absolute;
    -ms-transform: translate(-140%, 10%);
    transform: translate(-140%, 10%);
}

.eeh-control-panel {
    font-family: monospace;
    background: var(--default-bg-panel-active-color);
    border: 3px solid var(--default-panel-divider-outer-side-color);
    border-radius: 6px;
    padding: 16px 9px 0px 9px;
    padding-bottom: 10px;
    max-width: 480px;
    margin: 1rem auto;
    position: relative;
}

.eeh-head {
    font-family: monospace;
    font-size: 20px;
    font-weight: 400;
    margin: 0px;
    margin-bottom: 0px;
    letter-spacing: 1px;
}
  .eeh-subline {
    font-size: 13px;
    color: var(--default-full-text-color);
    margin: 0px;
    margin-bottom: 10px;
    letter-spacing: 2px;
  }
  .eeh-divider {
    border: none;
    border-top: 1px solid var(--default-black-color);
    margin: 0 0 18px;
  }
  .eeh-options {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px;
    border: 2px solid var(--default-panel-divider-outer-side-color);
    border-radius: 4px;
    margin-top: 10px;
    margin-bottom: 10px;
    background: var(--default-gray-e5-color);
  }

  .eeh-options p span {
    font-weight: bold;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

.eeh-options p {
    margin-top: 5px;
    margin-left: 2px;
    font-size: 15px;
    font-weight: 700;
    line-height: 18px;
    font-family: arial;
}

.eeh-options button {
    background: transparent linear-gradient(180deg ,#CCCCCC 0%,#999999 60%,#666666 100%) 0 0 no-repeat;
    border-radius: 5px;
    font-family: Arial,sans-serif;
    font-size: 14px;
    font-weight: 700;
    text-align: center;
    letter-spacing: 0;
    color: #333;
    text-shadow: 0 1px 0 #ffffff66;
    text-decoration: none;
    text-transform: uppercase;
    margin: 0;
    border: none;
    outline: none;
    overflow: visible;
    box-sizing: border-box;
    line-height: 16px;
    padding: 4px 8px;
    height: auto;
    white-space: nowrap;
    cursor: pointer;
    margin-right: 5px;
}
.eeh-options button:hover, .eeh-options button:focus {
    background: transparent linear-gradient(180deg,#E5E5E5 0%,#BBBBBB 60%,#999999 100%) 0 0 no-repeat;
    color: #333
}

.eeh-green {
    color: var(--user-status-green-color);
}

.eeh-red {
    color: var(--user-status-red-color);
}


@media screen and (max-width: 1000px) {
    html:not(.html-manual-desktop) [class*='topSection_'] #easterrandom span.eeh-text, .content-wrapper > #easterrandom span.eeh-text {
        display: none;
    }

    [class*='topSection_'] .eeh-icon-svg-wrap {
        -ms-transform: translate(-140%, -110%);
        transform: translate(-140%, -110%);
    }

    html:not(.html-manual-desktop) #eeh-float-wrap.eeh-float-top {
        top: 170px !important;
    }
}

/* SVG Colors */
.eeh-link svg, .eeh-icon-svg svg {
  filter: drop-shadow(0px 0.7px 0.1px #fff);
  width: 13px !important;
  height: 17px !important;
}
.eeh-icon-svg svg path {
  fill: #AFC372 !important;
}
body.dark-mode .eeh-icon svg, body.dark-mode .eeh-icon-svg svg {
  filter: drop-shadow(0px 0px 1.3px #000);
}

/* Preferences: Egg Navigator panel (spacing, no settings-cell chrome) */
#eeh-preferences-panel.eeh-prefs-wrap {
  margin-top: 20px;
}
#eeh-preferences-panel .eeh-prefs-inner {
  padding: 14px 18px 18px;
  box-sizing: border-box;
}
#eeh-preferences-panel .eeh-prefs-section {
  margin: 0;
  padding: 0;
  border: none;
  box-shadow: none;
}
#eeh-preferences-panel .eeh-prefs-heading {
  margin: 0 0 12px 0;
  padding: 0;
  line-height: 1.35;
}
#eeh-preferences-panel .eeh-prefs-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
#eeh-preferences-panel .eeh-prefs-section + .eeh-prefs-section {
  margin-top: 18px;
}
#eeh-preferences-panel #eeh-prefs-reset-hold-ms {
  display: block;
  width: 9em;
  max-width: 100%;
  margin-top: 6px;
  padding: 5px;
  box-sizing: border-box;
}

/* Torn Edits */
.members-cont>.member-item>a[href="profiles.php?XID=1468764"]>.member>.member-header {
    color: #E0CE00 !important;
}

.members-cont>.member-item>a[href="profiles.php?XID=1468764"]>.member>.member-cont>span::after {
    content: "👑  " url("https://profileimages.torn.com/ad324318-744c-c686-1468764.gif?v=1940629196397");
}
`);
}

function killButton() {
    console.log("[Heasley][Egg Navigator] Killing button...");
    let eggLink = document.getElementById("eggTraverse");
    if (eggLink) {
        let sidebarRow = eggLink.closest(`.eeh-link`);
        if (sidebarRow) {
            sidebarRow.remove();
        } else {
            let floatWrap = document.getElementById("eeh-float-wrap");
            if (floatWrap && floatWrap.contains(eggLink)) {
                floatWrap.remove();
            } else {
                eggLink.remove();
            }
        }
    }
}

function toggleFloatButton() {
    killButton();
    if (ButtonFloat) {
        ButtonFloat = 0;
        insertFloat();
    } else {
        ButtonFloat = 1;
        insertNormal();
    }
    saveEehStore();
    syncPrefsPanel();
    return ButtonFloat;
}

function toggleFloatPosition() {
    let floatEggLink = document.querySelector("#eggTraverse.eeh-float");
    if (!floatEggLink) return;

    console.log("[Heasley][Egg Navigator] Changing float position...");
    eeh_float_x = null;
    eeh_float_y = null;
    ButtonFloatPos++;
    if (ButtonFloatPos >= 4) ButtonFloatPos = 0; //cycle back to 0=bottom-left
    setFloatPosition();
    syncPrefsPanel();
    return ButtonFloatPos;
}

function setFloatPosition() {
    let floatWrap = document.getElementById("eeh-float-wrap");
    if (!floatWrap) return;

    floatWrap.classList.remove("eeh-float-bottom", "eeh-float-top", "eeh-float-left", "eeh-float-right", "eeh-float-custom", "eeh-handle-left", "eeh-handle-right");

    if (eeh_float_x != null && eeh_float_y != null) {
        floatWrap.classList.add("eeh-float-custom");
        applyWrapPositionPx(floatWrap, eeh_float_x, eeh_float_y, true);
        const clamped = clampWrapInViewport(floatWrap, eeh_float_x, eeh_float_y);
        if (clamped.left !== eeh_float_x || clamped.top !== eeh_float_y) {
            eeh_float_x = clamped.left;
            eeh_float_y = clamped.top;
            applyWrapPositionPx(floatWrap, clamped.left, clamped.top, true);
        }
        updateHandleSide(floatWrap);
        if (jQueryLoaded()) bindFloatDrag();
        saveEehStore();
        if (eeh_show_page_numbers) {
            ensureFloatOnScreenAfterLayout();
        }
        return;
    }

    floatWrap.style.removeProperty("left");
    floatWrap.style.removeProperty("top");
    floatWrap.style.removeProperty("right");
    floatWrap.style.removeProperty("bottom");

    switch (ButtonFloatPos) {
        case 0:
            floatWrap.classList.add("eeh-float-bottom", "eeh-float-left");
            break;
        case 1:
            floatWrap.classList.add("eeh-float-top", "eeh-float-left");
            break;
        case 2:
            floatWrap.classList.add("eeh-float-bottom", "eeh-float-right");
            break;
        case 3:
            floatWrap.classList.add("eeh-float-top", "eeh-float-right");
            break;
        default:
            floatWrap.classList.add("eeh-float-bottom", "eeh-float-left");
    }

    if (eeh_float_drag) updateHandleSide(floatWrap);
    if (jQueryLoaded()) bindFloatDrag();
    saveEehStore();
    if (eeh_show_page_numbers) {
        ensureFloatOnScreenAfterLayout();
    }
}

if (typeof GM.registerMenuCommand !== "undefined") {
    GM.registerMenuCommand("Toggle Floating Button", toggleFloatButton, { autoClose: false });
    GM.registerMenuCommand("Toggle Float Position", toggleFloatPosition, { autoClose: false });
}

})();
