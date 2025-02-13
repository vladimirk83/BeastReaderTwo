 // scripts.js

/* 
  This version implements the following changes:

  1) All user-facing text (messages, labels, alerts) is now in English by default.
  2) If the user selects any Brooklyn or Front track (Brooklyn Midday, Brooklyn Evening, Front Midday, Front Evening),
     the "Bet Number" for that play MUST be exactly 3 digits. Anything else is invalid.
  3) The unique 8-digit ticket number and the QR code are generated ONLY after the user clicks "Confirm & Download" 
     in the preview modal, not at the time the preview is shown.
  4) The print functionality (window.print()) is commented out, since printing is not required for now.
*/

/* Replace with your real SheetDB (or API) endpoint */
const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/bl57zyh73b0ev';

/* Global variables */
let transactionDateTime = '';
let betData = [];
let isProgrammaticReset = false;
window.ticketImageDataUrl = null; // We'll store the final ticket image here

$(document).ready(function() {

    /* Initialize Day.js with plugins as needed */
    dayjs.extend(dayjs_plugin_customParseFormat);
    dayjs.extend(dayjs_plugin_arraySupport);

    // Variables for counting plays/tracks/days
    let playCount = 0;
    let selectedTracksCount = 0;
    let selectedDaysCount = 0;

    // The user can only add up to 25 plays
    const MAX_PLAYS = 25;

    // Schedules/cutoff times
    const cutoffTimes = {
        "USA": {
            "New York Mid Day": "14:20",
            "New York Evening": "22:00",
            "Georgia Mid Day": "12:20",
            "Georgia Evening": "18:40",
            "New Jersey Mid Day": "12:50",
            "New Jersey Evening": "22:00",
            "Florida Mid Day": "13:20",
            "Florida Evening": "21:30",
            "Connecticut Mid Day": "13:30",
            "Connecticut Evening": "22:00",
            "Georgia Night": "22:00",
            "Pensilvania AM": "12:45",
            "Pensilvania PM": "18:15",

            // Brooklyn / Front (same logic as Win4, but must be exactly 3 digits)
            "Brooklyn Midday": "14:20",
            "Brooklyn Evening": "22:00",
            "Front Midday": "14:20",
            "Front Evening": "22:00"
        },
        "Santo Domingo": {
            "Real": "11:45",
            "Gana mas": "13:25",
            "Loteka": "18:30",
            "Nacional": "19:30",
            "Quiniela Pale": "19:30",
            "Primera Día": "10:50",
            "Suerte Día": "11:20",
            "Lotería Real": "11:50",
            "Suerte Tarde": "16:50",
            "Lotedom": "16:50",
            "Primera Noche": "18:50",
            "Panama": "16:00"
        },
        "Venezuela": {
            "Venezuela": "00:00" // Always open, effectively ignored in cutoff checks
        }
    };

    // Betting limits per game mode
    const betLimits = {
        "Win 4":         { straight: 6,  box: 30, combo: 6 },
        "Pick 3":        { straight: 35, box: 50, combo: 35 },
        "Venezuela":     { straight: 100 },
        "Venezuela-Pale":{ straight: 100 },
        "Pulito":        { straight: 100 },
        "RD-Quiniela":   { straight: 100 },
        "RD-Pale":       { straight: 20 }
    };

    /* 
       Determine the game mode based on selected tracks and the bet number length.
       This is primarily used to label the row with the correct type of game.
    */
    function determineGameMode(tracks, betNumber, rowElement) {
        let mode = "-";

        const isUSA = tracks.some(t => Object.keys(cutoffTimes.USA).includes(t));
        const isSD = tracks.some(t => Object.keys(cutoffTimes["Santo Domingo"]).includes(t));
        const includesVenezuela = tracks.includes("Venezuela");

        const length = betNumber.length;
        const boxValue = rowElement.find(".box").val() || "";

        // For combined Venezuela + USA
        if (includesVenezuela && isUSA) {
            if (length === 2) {
                mode = "Venezuela";
            } else if (length === 4) {
                mode = "Venezuela-Pale";
            }
        }
        // Only USA
        else if (isUSA && !isSD) {
            if (length === 4) {
                mode = "Win 4";
            } else if (length === 3) {
                mode = "Pick 3"; 
            } else if (length === 2) {
                mode = "Pulito";
            }
        }
        // Only Santo Domingo
        else if (isSD && !isUSA) {
            if (length === 2) {
                mode = "RD-Quiniela";
            } else if (length === 4) {
                mode = "RD-Pale";
            }
        }
        return mode;
    }

    /* 
       Add a new row for the plays, up to 25 total
    */
    function addPlayRow() {
        if (playCount >= MAX_PLAYS) {
            alert("You have reached the maximum of 25 plays.");
            return;
        }
        playCount++;
        const rowHTML = `
            <tr>
                <td>${playCount}</td>
                <td><input type="number" class="form-control betNumber" min="0" max="9999" required></td>
                <td class="gameMode">-</td>
                <td><input type="number" class="form-control straight" min="0" max="100" step="1" placeholder="e.g. 5"></td>
                <td><input type="text" class="form-control box" placeholder="e.g. 1,2 or 3"></td>
                <td><input type="number" class="form-control combo" min="0" max="50" step="0.10" placeholder="e.g. 3.00"></td>
                <td class="total">0.00</td>
            </tr>
        `;
        $("#tablaJugadas").append(rowHTML);
        storeFormState();

        // Automatically focus betNumber in the newly added row
        $("#tablaJugadas tr:last .betNumber").focus();
    }

    // Initialize with one row
    addPlayRow();

    /*
       Calculate the total for the entire form (sum of each row's "total"), multiplied by selected tracks * days
    */
    function calculateTotal() {
        let sum = 0;
        $(".total").each(function() {
            sum += parseFloat($(this).text()) || 0;
        });
        if (selectedDaysCount === 0) {
            sum = 0;
        } else {
            sum = (sum * selectedTracksCount * selectedDaysCount).toFixed(2);
        }
        $("#totalJugadas").text(sum);
        storeFormState();
    }

    /*
       Calculate the total for a specific row
    */
    function calculateRowTotal(rowElement) {
        const mode = rowElement.find(".gameMode").text();
        const betNumber = rowElement.find(".betNumber").val();
        if (!betNumber || betNumber.length < 2 || betNumber.length > 4) {
            rowElement.find(".total").text("0.00");
            return;
        }

        let straightVal = parseFloat(rowElement.find(".straight").val()) || 0;
        let boxValText = rowElement.find(".box").val() || "";
        let comboVal = parseFloat(rowElement.find(".combo").val()) || 0;

        // Enforce bet limits if needed
        if (betLimits[mode]) {
            straightVal = Math.min(straightVal, betLimits[mode].straight ?? straightVal);
            if (betLimits[mode].box !== undefined && mode !== "Pulito") {
                const numericBox = parseFloat(boxValText) || 0;
                boxValText = Math.min(numericBox, betLimits[mode].box).toString();
            }
            if (betLimits[mode].combo !== undefined) {
                comboVal = Math.min(comboVal, betLimits[mode].combo ?? comboVal);
            }
        }

        let totalVal = 0;

        if (mode === "Pulito") {
            // Pulito uses "straight" * the count of positions in box
            if (boxValText) {
                const positions = boxValText.split(",").map(v => v.trim()).filter(Boolean);
                totalVal = straightVal * positions.length;
            }
        }
        else if (mode === "Venezuela" || mode.startsWith("RD-")) {
            totalVal = straightVal;
        }
        else if (mode === "Win 4" || mode === "Pick 3") {
            const combosCount = calculateCombosCount(betNumber);
            const numericBox = parseFloat(boxValText) || 0;
            totalVal = straightVal + numericBox + (comboVal * combosCount);
        }
        else {
            // Other or unknown
            const numericBox = parseFloat(boxValText) || 0;
            totalVal = straightVal + numericBox + comboVal;
        }

        rowElement.find(".total").text(totalVal.toFixed(2));
        calculateTotal();
    }

    /*
       For combos: how many unique permutations are possible for the given betNumber
       e.g. "112" => 3 combos, "123" => 6 combos, etc.
    */
    function calculateCombosCount(betNumber) {
        const freq = {};
        for (let ch of betNumber) {
            freq[ch] = (freq[ch] || 0) + 1;
        }
        const factorial = (n) => n <= 1 ? 1 : n * factorial(n - 1);
        let denom = 1;
        for (const d in freq) {
            denom *= factorial(freq[d]);
        }
        return factorial(betNumber.length) / denom;
    }

    /*
       Check if the user selected any track from Brooklyn or Front
       So we can enforce 3-digit only for the betNumber
    */
    function hasBrooklynOrFront(tracks) {
        const setBF = new Set([
            "Brooklyn Midday", "Brooklyn Evening",
            "Front Midday", "Front Evening"
        ]);
        // Return true if any selected track is in that set
        return tracks.some(t => setBF.has(t));
    }

    /*
       Resets the entire form
    */
    function resetForm() {
        isProgrammaticReset = true;
        $("#lotteryForm")[0].reset();
        $("#tablaJugadas").empty();
        playCount = 0;
        selectedTracksCount = 0;
        selectedDaysCount = 0;
        window.ticketImageDataUrl = null;

        addPlayRow();
        $("#totalJugadas").text("0.00");

        showCutoffTimes();
        highlightDuplicates();
        disableTracksByTime();

        localStorage.removeItem('formState');
        isProgrammaticReset = false;
    }

    /*
       Highlight duplicate betNumbers
    */
    function highlightDuplicates() {
        const betFields = $(".betNumber");
        const seen = {};
        const dups = new Set();
        betFields.each(function() {
            const val = $(this).val().trim();
            if (val) {
                if (seen[val]) {
                    dups.add(val);
                } else {
                    seen[val] = true;
                }
            }
        });
        betFields.each(function() {
            const val = $(this).val().trim();
            if (dups.has(val)) {
                $(this).addClass("duplicado");
            } else {
                $(this).removeClass("duplicado");
            }
        });
        storeFormState();
    }

    /*
       Adds 1 row when the page loads, so we do that above
    */
    
    // Button to add a row
    $("#agregarJugada").click(() => addPlayRow());

    // Button to remove the last row
    $("#eliminarJugada").click(() => {
        if (playCount === 0) {
            alert("No plays to remove.");
            return;
        }
        $("#tablaJugadas tr:last").remove();
        playCount--;
        // Re-enumerate
        $("#tablaJugadas tr").each(function(i) {
            $(this).find("td:first").text(i + 1);
        });
        calculateTotal();
    });

    // Button to reset
    $("#resetForm").click(() => {
        if (confirm("Are you sure you want to reset the form? This will remove all current plays.")) {
            resetForm();
        }
    });

    /*
       Event delegation: when user types in betNumber, straight, box, combo, etc.
    */
    $("#tablaJugadas").on("input", ".betNumber, .straight, .box, .combo", function() {
        const row = $(this).closest("tr");
        const betNumber = row.find(".betNumber").val();
        const selectedTracks = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
        const gameMode = determineGameMode(selectedTracks, betNumber, row);
        row.find(".gameMode").text(gameMode);

        // Re-check if we must enforce 3-digit for Brooklyn/Front
        if (hasBrooklynOrFront(selectedTracks)) {
            // If there's at least one Brooklyn/Front track selected, 
            // we strictly require 3-digit betNumber in that row.
            // If the length is not 3, the row total = 0
            if (betNumber.length !== 3) {
                row.find(".total").text("0.00");
                // We won't return here, because user might keep typing
            }
        }

        updatePlaceholders(gameMode, row);
        calculateRowTotal(row);
        highlightDuplicates();
    });

    /*
       Update placeholders (and enable/disable) straight/box/combo, according to the game mode
    */
    function updatePlaceholders(mode, rowElement) {
        if (betLimits[mode]) {
            rowElement.find(".straight")
                .attr("placeholder", `Max $${betLimits[mode].straight ?? 100}`)
                .prop("disabled", false);
        } else {
            rowElement.find(".straight")
                .attr("placeholder", "e.g. 5.00")
                .prop("disabled", false);
        }

        if (mode === "Pulito") {
            rowElement.find(".box")
                .attr("placeholder", "Positions? e.g. 1,2,3")
                .prop("disabled", false);
            rowElement.find(".combo")
                .attr("placeholder", "N/A")
                .prop("disabled", true)
                .val("");
        }
        else if (mode === "Venezuela" || mode.startsWith("RD-")) {
            rowElement.find(".box")
                .attr("placeholder", "N/A")
                .prop("disabled", true)
                .val("");
            rowElement.find(".combo")
                .attr("placeholder", "N/A")
                .prop("disabled", true)
                .val("");
        }
        else if (mode === "Win 4" || mode === "Pick 3") {
            rowElement.find(".box")
                .attr("placeholder", `Max $${betLimits[mode].box}`)
                .prop("disabled", false);
            rowElement.find(".combo")
                .attr("placeholder", `Max $${betLimits[mode].combo}`)
                .prop("disabled", false);
        }
        else {
            rowElement.find(".box")
                .attr("placeholder", "e.g. 2.00")
                .prop("disabled", false);
            rowElement.find(".combo")
                .attr("placeholder", "e.g. 3.00")
                .prop("disabled", false);
        }

        storeFormState();
    }

    /*
       Track selection changes
    */
    $(".track-checkbox").change(function() {
        const selectedT = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
        // "Venezuela" doesn't count in the multiplier
        selectedTracksCount = selectedT.filter(t => t !== "Venezuela").length || 1;
        calculateTotal();
        disableTracksByTime();
    });

    /* 
       Initialize the modal 
    */
    const ticketModal = new bootstrap.Modal(document.getElementById("ticketModal"));

    /*
       Determine if the user includes "today" among selected dates
    */
    function userSelectedToday() {
        const val = $("#fecha").val();
        if (!val) return false;
        const arr = val.split(", ");
        const today = dayjs().startOf("day");
        for (let dateStr of arr) {
            const [mm, dd, yyyy] = dateStr.split("-").map(Number);
            const pick = dayjs(new Date(yyyy, mm-1, dd)).startOf("day");
            if (pick.isSame(today, "day")) {
                return true;
            }
        }
        return false;
    }

    /*
       Show cutoff times in the UI
       (except for Venezuela, which is always open)
    */
    function showCutoffTimes() {
        $(".cutoff-time").each(function(){
            const track = $(this).data("track");
            if (track === "Venezuela") {
                return; // hide or ignore
            }
            let rawTime = "";
            if (cutoffTimes.USA[track]) {
                rawTime = cutoffTimes.USA[track];
            } else if (cutoffTimes["Santo Domingo"][track]) {
                rawTime = cutoffTimes["Santo Domingo"][track];
            } else if (cutoffTimes.Venezuela[track]) {
                rawTime = cutoffTimes.Venezuela[track];
            }
            if (rawTime) {
                let original = dayjs(rawTime, "HH:mm");
                let finalCutoff;
                if (original.isAfter(dayjs("21:30", "HH:mm"))) {
                    finalCutoff = dayjs("22:00", "HH:mm");
                } else {
                    finalCutoff = original.subtract(10, "minute");
                }
                const h = finalCutoff.format("HH");
                const m = finalCutoff.format("mm");
                $(this).text(`Cutoff Time: ${h}:${m}`);
            }
        });
    }

    /*
       Enable/disable tracks depending on real time,
       except "Venezuela" which is always open
    */
    function disableTracksByTime() {
        if (!userSelectedToday()) {
            enableAllTracks();
            return;
        }
        const now = dayjs();
        $(".track-checkbox").each(function(){
            const track = $(this).val();
            if (track === "Venezuela") {
                // always enabled
                return;
            }
            const raw = getTrackCutoff(track);
            if (raw) {
                let orig = dayjs(raw, "HH:mm");
                let finalCut;
                if (orig.isAfter(dayjs("21:30", "HH:mm"))) {
                    finalCut = dayjs("22:00", "HH:mm");
                } else {
                    finalCut = orig.subtract(10, "minute");
                }
                if (now.isAfter(finalCut) || now.isSame(finalCut)) {
                    $(this).prop("disabled", true).prop("checked", false);
                    $(this).closest(".form-check").find(".form-check-label").css({
                        opacity: 0.5,
                        cursor: "not-allowed"
                    });
                } else {
                    $(this).prop("disabled", false);
                    $(this).closest(".form-check").find(".form-check-label").css({
                        opacity: 1,
                        cursor: "pointer"
                    });
                }
            }
        });
        storeFormState();
    }

    /*
       Helper: get the raw closing time for a given track
    */
    function getTrackCutoff(trackName) {
        for (let region in cutoffTimes) {
            if (cutoffTimes[region][trackName]) {
                return cutoffTimes[region][trackName];
            }
        }
        return null;
    }

    /*
       Enable all tracks if not playing today
    */
    function enableAllTracks() {
        $(".track-checkbox").each(function(){
            $(this).prop("disabled", false);
            $(this).closest(".form-check").find(".form-check-label").css({
                opacity: 1,
                cursor: "pointer"
            });
        });
    }

    /*
       Save the form state to localStorage
    */
    function storeFormState() {
        const formState = {
            playCount,
            selectedTracksCount,
            selectedDaysCount,
            dateValue: $("#fecha").val(),
            plays: []
        };
        $("#tablaJugadas tr").each(function(){
            const betNum = $(this).find(".betNumber").val();
            const mode = $(this).find(".gameMode").text();
            const straight = $(this).find(".straight").val();
            const box = $(this).find(".box").val();
            const combo = $(this).find(".combo").val();
            const total = $(this).find(".total").text();
            formState.plays.push({
                betNumber: betNum,
                gameMode: mode,
                straight: straight,
                box: box,
                combo: combo,
                total: total
            });
        });
        localStorage.setItem("formState", JSON.stringify(formState));
    }

    /*
       Load the form state from localStorage
    */
    function loadFormState() {
        const data = JSON.parse(localStorage.getItem("formState"));
        if (data) {
            $("#fecha").val(data.dateValue);
            selectedDaysCount = data.selectedDaysCount;
            selectedTracksCount = data.selectedTracksCount;
            playCount = data.playCount;
            $("#tablaJugadas").empty();
            data.plays.forEach((p, index) => {
                if (index >= MAX_PLAYS) return;
                const row = `
                    <tr>
                        <td>${index + 1}</td>
                        <td><input type="number" class="form-control betNumber" required value="${p.betNumber}"></td>
                        <td class="gameMode">${p.gameMode}</td>
                        <td><input type="number" class="form-control straight" value="${p.straight}"></td>
                        <td><input type="text" class="form-control box" value="${p.box}"></td>
                        <td><input type="number" class="form-control combo" value="${p.combo}"></td>
                        <td class="total">${p.total}</td>
                    </tr>
                `;
                $("#tablaJugadas").append(row);
            });
            // if localStorage had more than 25 plays, we limit
            if (playCount > MAX_PLAYS) {
                playCount = MAX_PLAYS;
            }
            calculateTotal();
            showCutoffTimes();
            disableTracksByTime();
            highlightDuplicates();
        } else {
            // No existing state
        }
    }

    // Load existing form state if present
    loadFormState();

    /*
       Prevent unwanted reset events
    */
    $("#lotteryForm").on("reset", function(e){
        if (!isProgrammaticReset && (!e.originalEvent || !$(e.originalEvent.submitter).hasClass("btn-reset"))) {
            e.preventDefault();
        }
    });

    /*
       "Generate Ticket" => just a preview, but does NOT generate QR code or ticket number yet
    */
    $("#generarTicket").click(function(){
        const dateValue = $("#fecha").val();
        if (!dateValue) {
            alert("Please select at least one date.");
            return;
        }
        const chosenTracks = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
        if (!chosenTracks || chosenTracks.length === 0) {
            alert("Please select at least one track.");
            return;
        }
        // If Venezuela is chosen, ensure at least one track from USA also chosen
        const usaTracks = chosenTracks.filter(t => Object.keys(cutoffTimes.USA).includes(t));
        if (chosenTracks.includes("Venezuela") && usaTracks.length === 0) {
            alert("To play 'Venezuela', you must also select at least one track from 'USA'.");
            return;
        }

        // Check time cutoffs if user selected "today"
        const arrayDates = dateValue.split(", ");
        const today = dayjs().startOf("day");
        for (let strDate of arrayDates) {
            const [mm, dd, yyyy] = strDate.split("-").map(Number);
            const betDate = dayjs(new Date(yyyy, mm-1, dd)).startOf("day");
            if (betDate.isSame(today, "day")) {
                const now = dayjs();
                for (let t of chosenTracks) {
                    if (t === "Venezuela") continue; // skip
                    const rawCutoff = getTrackCutoff(t);
                    if (rawCutoff) {
                        let cOriginal = dayjs(rawCutoff, "HH:mm");
                        let cFinal;
                        if (cOriginal.isAfter(dayjs("21:30", "HH:mm"))) {
                            cFinal = dayjs("22:00", "HH:mm");
                        } else {
                            cFinal = cOriginal.subtract(10, "minute");
                        }
                        if (now.isAfter(cFinal) || now.isSame(cFinal)) {
                            alert(`The track "${t}" is already closed for today. Please choose another track or a future date.`);
                            return;
                        }
                    }
                }
            }
        }

        // Validate each row
        let allValid = true;
        const errorsFound = [];
        const rows = $("#tablaJugadas tr");
        rows.each(function() {
            const rowNum = parseInt($(this).find("td:first").text());
            const betNumber = $(this).find(".betNumber").val();
            const mode = $(this).find(".gameMode").text();
            const straight = $(this).find(".straight").val();
            const box = $(this).find(".box").val();
            const combo = $(this).find(".combo").val();
            const total = $(this).find(".total").text();

            // Basic validations
            if (!betNumber || betNumber.length < 2 || betNumber.length > 4) {
                allValid = false;
                errorsFound.push(rowNum);
                $(this).find(".betNumber").addClass("error-field");
            } else {
                $(this).find(".betNumber").removeClass("error-field");
            }

            // If user selected any Brooklyn/Front track => strictly 3 digits
            if (hasBrooklynOrFront(chosenTracks)) {
                if (betNumber.length !== 3) {
                    allValid = false;
                    errorsFound.push(rowNum);
                }
            }

            if (mode === "-") {
                allValid = false;
                errorsFound.push(rowNum);
            }

            // Extra checks if needed
            // e.g. for Pulito, we need a straight > 0, box something, etc.
            if (["Venezuela", "Venezuela-Pale", "Pulito", "RD-Quiniela", "RD-Pale"].includes(mode)) {
                if (!straight || parseFloat(straight) <= 0) {
                    allValid = false;
                    errorsFound.push(rowNum);
                    $(this).find(".straight").addClass("error-field");
                } else {
                    $(this).find(".straight").removeClass("error-field");
                }
                if (mode === "Pulito") {
                    // If box is empty => invalid
                    if (!box) {
                        allValid = false;
                        errorsFound.push(rowNum);
                        $(this).find(".box").addClass("error-field");
                    } else {
                        $(this).find(".box").removeClass("error-field");
                    }
                }
            }
            else if (["Win 4", "Pick 3"].includes(mode)) {
                // At least one > 0 among straight/box/combo
                if ((!straight || parseFloat(straight) <= 0) &&
                    (!box || parseFloat(box) <= 0) &&
                    (!combo || parseFloat(combo) <= 0)) {
                    allValid = false;
                    errorsFound.push(rowNum);
                    $(this).find(".straight").addClass("error-field");
                    $(this).find(".box").addClass("error-field");
                    $(this).find(".combo").addClass("error-field");
                } else {
                    if (straight && parseFloat(straight) > 0) {
                        $(this).find(".straight").removeClass("error-field");
                    }
                    if (box && parseFloat(box) > 0) {
                        $(this).find(".box").removeClass("error-field");
                    }
                    if (combo && parseFloat(combo) > 0) {
                        $(this).find(".combo").removeClass("error-field");
                    }
                }
            }
        });

        if (!allValid) {
            const uniq = [...new Set(errorsFound)].join(", ");
            alert(`Some plays have errors (rows: ${uniq}). Please fix them before generating the ticket preview.`);
            return;
        }

        // Show the modal WITHOUT generating QR code or unique ticket number
        // We simply fill the table so the user can review
        $("#ticketTracks").text(chosenTracks.join(", "));
        $("#ticketJugadas").empty();

        rows.each(function(){
            const rowNumber = $(this).find("td").first().text();
            const betNumber = $(this).find(".betNumber").val();
            const mode = $(this).find(".gameMode").text();
            const straightVal = parseFloat($(this).find(".straight").val()) || 0;
            let boxVal = $(this).find(".box").val();
            boxVal = (boxVal === "") ? "-" : boxVal;
            const comboVal = parseFloat($(this).find(".combo").val()) || 0;
            const rowTotal = parseFloat($(this).find(".total").text()) || 0;
            
            const rowHTML = `
                <tr>
                    <td>${rowNumber}</td>
                    <td>${betNumber}</td>
                    <td>${mode}</td>
                    <td>${straightVal > 0 ? straightVal.toFixed(2) : "-"}</td>
                    <td>${boxVal !== "-" ? boxVal : "-"}</td>
                    <td>${comboVal > 0 ? comboVal.toFixed(2) : "-"}</td>
                    <td>${rowTotal.toFixed(2)}</td>
                </tr>
            `;
            $("#ticketJugadas").append(rowHTML);
        });

        // We do NOT generate "Ticket Number" or QR code here
        $("#ticketTotal").text($("#totalJugadas").text());
        // The "transaction date" is also not generated here as final
        // But we can show the date/time of this generation if needed. 
        // For now, let's keep it blank or use a preview text
        $("#ticketTransaccion").text(dayjs().format("MM/DD/YYYY hh:mm A"));
        $("#numeroTicket").text("(Not assigned yet)");

        // Clear QR code container (so user sees none)
        $("#qrcode").empty();

        // Show the modal
        ticketModal.show();
        storeFormState();
    });

    /*
       "Confirm & Download" button => now we generate the final unique ticket number + QR code
       Then we create the final image, and remove the call to window.print() (comment out).
    */
    $("#confirmarTicket").click(function(){
        const confirmBtn = $(this);
        confirmBtn.prop("disabled", true);

        // Now we generate the unique 8-digit ticket number
        const uniqueNumber = generateUniqueTicketNumber();
        // Insert it into the UI
        $("#numeroTicket").text(uniqueNumber);

        // Also set the final transaction date/time
        transactionDateTime = dayjs().format("MM/DD/YYYY hh:mm A");
        $("#ticketTransaccion").text(transactionDateTime);

        // Create the QR code
        $("#qrcode").empty();
        new QRCode(document.getElementById("qrcode"), {
            text: uniqueNumber,
            width: 128,
            height: 128
        });

        const ticketElement = document.getElementById("preTicket");
        const originalStyles = {
            width: $(ticketElement).css("width"),
            height: $(ticketElement).css("height"),
            maxHeight: $(ticketElement).css("max-height"),
            overflowY: $(ticketElement).css("overflow-y")
        };

        // Expand to capture everything with html2canvas
        $(ticketElement).css({
            width: "auto",
            height: "auto",
            maxHeight: "none",
            overflowY: "visible"
        });

        setTimeout(() => {
            html2canvas(ticketElement, { scale: 4 })
                .then(canvas => {
                    const dataUrl = canvas.toDataURL("image/png");
                    window.ticketImageDataUrl = dataUrl;

                    // Auto-download the image
                    const link = document.createElement("a");
                    link.href = dataUrl;
                    link.download = `ticket_${uniqueNumber}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    alert("Your ticket image has been downloaded.");

                    // Save bet data to SheetDB
                    saveBetDataToSheetDB(uniqueNumber, function(success){
                        if (success) {
                            console.log("Bet data was successfully sent to SheetDB.");
                        } else {
                            console.error("Error sending bet data to SheetDB.");
                        }
                    });

                    // The print function is currently NOT needed, so we comment it out:
                    // window.print();

                    // Show the share button
                    $("#shareTicket").removeClass("d-none");

                })
                .catch(err => {
                    console.error("Error capturing the ticket:", err);
                    alert("There was a problem generating the ticket image. Please try again.");
                })
                .finally(() => {
                    $(ticketElement).css(originalStyles);
                    confirmBtn.prop("disabled", false);
                });

        }, 500);

    });

    /*
       "Share Ticket" button => Web Share API
    */
    $("#shareTicket").click(async function(){
        if (!window.ticketImageDataUrl) {
            alert("No ticket image available to share.");
            return;
        }
        if (navigator.canShare) {
            try {
                const resp = await fetch(window.ticketImageDataUrl);
                const blob = await resp.blob();
                const file = new File([blob], "ticket.png", { type: "image/png" });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: "Ticket",
                        text: "Sharing my Ticket"
                    });
                } else {
                    alert("Your browser does not support file sharing. Please share the downloaded image manually.");
                }
            } catch(err) {
                console.error("Share error:", err);
                alert("Error trying to share the ticket image.");
            }
        } else {
            alert("Your browser does not support the Web Share API with files. Please share manually.");
        }
    });

    /*
       Save the final bet data to SheetDB or other endpoint
       Here we assume betData is built from the final plays
    */
    function saveBetDataToSheetDB(uniqueTicket, callback) {
        // Re-build betData from the final table
        betData = []; 
        const dateValue = $("#fecha").val() || "";
        const chosenTracks = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
        const joinedTracks = chosenTracks.join(", ");
        const nowISO = dayjs().toISOString();

        $("#tablaJugadas tr").each(function(){
            const rowNum = $(this).find("td:first").text();
            const betNumber = $(this).find(".betNumber").val();
            const mode = $(this).find(".gameMode").text();
            const straight = $(this).find(".straight").val();
            const box = $(this).find(".box").val();
            const combo = $(this).find(".combo").val();
            const total = $(this).find(".total").text();

            // Only push if valid
            if (mode !== "-") {
                betData.push({
                    "Ticket Number": uniqueTicket,
                    "Transaction DateTime": transactionDateTime,
                    "Bet Dates": dateValue,
                    "Tracks": joinedTracks,
                    "Bet Number": betNumber,
                    "Game Mode": mode,
                    "Straight ($)": straight || "",
                    "Box ($)": box || "",
                    "Combo ($)": combo || "",
                    "Total ($)": total || "0.00",
                    "Row Number": rowNum,
                    "Timestamp": nowISO
                });
            }
        });

        console.log("Sending betData to SheetDB:", betData);

        fetch(SHEETDB_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ data: betData })
        })
        .then(resp => {
            if (!resp.ok) {
                throw new Error(`SheetDB error, status: ${resp.status}`);
            }
            return resp.json();
        })
        .then(data => {
            console.log("Data stored in SheetDB:", data);
            callback(true);
        })
        .catch(error => {
            console.error("Error sending to SheetDB:", error);
            callback(false);
        });
    }

    /*
       Generate a unique 8-digit ticket number
    */
    function generateUniqueTicketNumber() {
        return Math.floor(10000000 + Math.random() * 90000000).toString();
    }

    // Show cutoff times on page load
    showCutoffTimes();
    // Check track availability by current time
    disableTracksByTime();
    // Re-check every minute
    setInterval(disableTracksByTime, 60000);

});
