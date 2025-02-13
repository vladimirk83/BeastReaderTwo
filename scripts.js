 // scripts.js

/* 
  Revised version focusing on:
  1) Re-enabling the Flatpickr calendar on both mobile and desktop so users can pick dates visually,
     rather than typing them. 
     - We ensure `allowInput: false`, `clickOpens: true`, and attach the calendar in a high z-index container.
  2) Keeping the final ticket layout horizontal even on mobile, avoiding “vertical stacking”
     that was causing data to get squashed. We'll enforce a horizontal table with scroll if needed.
  3) Previous logic remains intact: Brooklyn/Front => exactly 3 digits, QR code + ticket # only on "Confirm" click,
     printing disabled, and everything in English.

  This file is intended to REPLACE your existing scripts.js code. 
  (No changes to HTML/CSS unless you specifically allow them.)
*/

/* Replace with your real SheetDB (or API) endpoint */
const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/bl57zyh73b0ev';

let transactionDateTime = '';
let betData = [];
let isProgrammaticReset = false;
window.ticketImageDataUrl = null; // We'll store the final ticket image here

$(document).ready(function() {

    /* 
       1) Initialize Flatpickr for #fecha
          - `allowInput: false` so user must pick from the calendar
          - `clickOpens: true` ensures the calendar pops up on click
          - `appendTo: document.body` + `zIndex` fix to ensure it's not hidden
          - `mode: "multiple"` so user can pick multiple dates 
    */
    flatpickr("#fecha", {
        mode: "multiple",
        dateFormat: "m-d-Y",
        minDate: "today",
        clickOpens: true,
        allowInput: false,
        appendTo: document.body,
        onReady: function(selectedDates, dateStr, instance) {
            // Ensure high z-index so it’s above other elements
            instance.calendarContainer.style.zIndex = 999999; 
        },
        onChange: function(selectedDates, dateStr, instance) {
            // Update selectedDaysCount
            selectedDaysCount = selectedDates.length;
            calculateTotal();
            storeFormState();
            disableTracksByTime();
        }
    });

    // We'll store how many rows the user has, how many tracks, how many days, etc.
    let playCount = 0;
    let selectedTracksCount = 0;
    let selectedDaysCount = 0;

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

            // Brooklyn & Front (must be exactly 3 digits)
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
            "Venezuela": "00:00" // Always open
        }
    };

    // Limits
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
      2) Keep the final ticket layout horizontal (in mobile as well).
      We'll ensure #preTicket table doesn't get stacked vertically:
      We can do it with a helper function that sets "white-space:nowrap; overflow-x:auto;"
      We'll call it after building the preview table so it looks correct on mobile.
    */
    function fixTicketLayoutForMobile() {
        // Force horizontal layout and allow scrolling
        $("#preTicket table, #preTicket th, #preTicket td").css("white-space", "nowrap");
        $("#preTicket").css("overflow-x", "auto");
    }

    /*
       Determine the game mode
    */
    function determineGameMode(tracks, betNumber, rowElement) {
        let mode = "-";

        const isUSA = tracks.some(t => Object.keys(cutoffTimes.USA).includes(t));
        const isSD  = tracks.some(t => Object.keys(cutoffTimes["Santo Domingo"]).includes(t));
        const includesVenezuela = tracks.includes("Venezuela");

        const length = betNumber.length;

        if (includesVenezuela && isUSA) {
            if (length === 2) {
                mode = "Venezuela";
            } else if (length === 4) {
                mode = "Venezuela-Pale";
            }
        }
        else if (isUSA && !isSD) {
            if (length === 4) {
                mode = "Win 4";
            } else if (length === 3) {
                mode = "Pick 3";
            } else if (length === 2) {
                mode = "Pulito";
            }
        }
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
       Create a new play row
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

        $("#tablaJugadas tr:last .betNumber").focus();
    }

    addPlayRow(); // Start with 1 row

    function calculateTotal() {
        let sum = 0;
        $(".total").each(function(){
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

    function calculateRowTotal(row) {
        const mode = row.find(".gameMode").text();
        const bn   = row.find(".betNumber").val();
        if (!bn || bn.length < 2 || bn.length > 4) {
            row.find(".total").text("0.00");
            return;
        }
        let st  = parseFloat(row.find(".straight").val()) || 0;
        let box = row.find(".box").val() || "";
        let co  = parseFloat(row.find(".combo").val()) || 0;

        if (betLimits[mode]) {
            st  = Math.min(st, betLimits[mode].straight  ?? st);
            if (betLimits[mode].box !== undefined && mode !== "Pulito") {
                const numericBox = parseFloat(box) || 0;
                box = Math.min(numericBox, betLimits[mode].box).toString();
            }
            if (betLimits[mode].combo !== undefined) {
                co = Math.min(co, betLimits[mode].combo  ?? co);
            }
        }

        let totalVal = 0;

        if (mode === "Pulito") {
            if (box) {
                const positions = box.split(",").map(v => v.trim()).filter(Boolean);
                totalVal = st * positions.length;
            }
        }
        else if (mode === "Venezuela" || mode.startsWith("RD-")) {
            totalVal = st;
        }
        else if (mode === "Win 4" || mode === "Pick 3") {
            const combosCount = calcCombos(bn);
            const numericBox = parseFloat(box) || 0;
            totalVal = st + numericBox + (co * combosCount);
        }
        else {
            const numericBox = parseFloat(box) || 0;
            totalVal = st + numericBox + co;
        }
        row.find(".total").text(totalVal.toFixed(2));
        calculateTotal();
    }

    function calcCombos(bn) {
        const freq = {};
        for (let ch of bn) {
            freq[ch] = (freq[ch] || 0) + 1;
        }
        const factorial = n => (n <= 1 ? 1 : n * factorial(n - 1));
        let denom = 1;
        for (const d in freq) {
            denom *= factorial(freq[d]);
        }
        return factorial(bn.length) / denom;
    }

    // Check if user selected Brooklyn/Front
    function hasBrooklynOrFront(tracks) {
        const setBF = new Set([
            "Brooklyn Midday", "Brooklyn Evening",
            "Front Midday", "Front Evening"
        ]);
        return tracks.some(t => setBF.has(t));
    }

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
        localStorage.removeItem("formState");
        isProgrammaticReset = false;
    }

    function highlightDuplicates() {
        const betFields = $(".betNumber");
        const seen = {};
        const dups = new Set();
        betFields.each(function(){
            const val = $(this).val().trim();
            if (val) {
                if (seen[val]) {
                    dups.add(val);
                } else {
                    seen[val] = true;
                }
            }
        });
        betFields.each(function(){
            const val = $(this).val().trim();
            if (dups.has(val)) {
                $(this).addClass("duplicado");
            } else {
                $(this).removeClass("duplicado");
            }
        });
        storeFormState();
    }

    // Buttons
    $("#agregarJugada").click(() => addPlayRow());
    $("#eliminarJugada").click(() => {
        if (playCount === 0) {
            alert("No plays to remove.");
            return;
        }
        $("#tablaJugadas tr:last").remove();
        playCount--;
        $("#tablaJugadas tr").each((i, el) => {
            $(el).find("td:first").text(i+1);
        });
        calculateTotal();
    });
    $("#resetForm").click(() => {
        if (confirm("Are you sure you want to reset the form? This will remove all current plays.")) {
            resetForm();
        }
    });

    // Input events
    $("#tablaJugadas").on("input", ".betNumber, .straight, .box, .combo", function(){
        const row = $(this).closest("tr");
        const bn = row.find(".betNumber").val();
        const tracks = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
        const mode = determineGameMode(tracks, bn, row);
        row.find(".gameMode").text(mode);

        // If user selected any Brooklyn/Front => strictly 3 digits
        if (hasBrooklynOrFront(tracks)) {
            if (bn.length !== 3) {
                // We'll just set total=0, user can keep typing
                row.find(".total").text("0.00");
            }
        }

        updatePlaceholders(mode, row);
        calculateRowTotal(row);
        highlightDuplicates();
    });

    function updatePlaceholders(mode, row) {
        if (betLimits[mode]) {
            row.find(".straight")
                .attr("placeholder", `Max $${betLimits[mode].straight ?? 100}`)
                .prop("disabled", false);
        } else {
            row.find(".straight")
                .attr("placeholder", "e.g. 5.00")
                .prop("disabled", false);
        }

        if (mode === "Pulito") {
            row.find(".box")
                .attr("placeholder", "Positions (1,2,3)?")
                .prop("disabled", false);
            row.find(".combo")
                .attr("placeholder", "N/A")
                .prop("disabled", true)
                .val("");
        }
        else if (mode === "Venezuela" || mode.startsWith("RD-")) {
            row.find(".box")
                .attr("placeholder", "N/A")
                .prop("disabled", true)
                .val("");
            row.find(".combo")
                .attr("placeholder", "N/A")
                .prop("disabled", true)
                .val("");
        }
        else if (mode === "Win 4" || mode === "Pick 3") {
            row.find(".box")
                .attr("placeholder", `Max $${betLimits[mode].box}`)
                .prop("disabled", false);
            row.find(".combo")
                .attr("placeholder", `Max $${betLimits[mode].combo}`)
                .prop("disabled", false);
        }
        else {
            row.find(".box")
                .attr("placeholder", "e.g. 2.00")
                .prop("disabled", false);
            row.find(".combo")
                .attr("placeholder", "e.g. 3.00")
                .prop("disabled", false);
        }
        storeFormState();
    }

    // Track checkboxes
    $(".track-checkbox").change(function(){
        const arr = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
        // "Venezuela" doesn't count for multiplier
        selectedTracksCount = arr.filter(x => x !== "Venezuela").length || 1;
        calculateTotal();
        disableTracksByTime();
    });

    // Initialize the modal
    const ticketModal = new bootstrap.Modal(document.getElementById("ticketModal"));

    // Helper: see if user selected "today"
    function userChoseToday() {
        const val = $("#fecha").val();
        if (!val) return false;
        const arr = val.split(", ");
        const nowDay = dayjs().startOf("day");
        for (let dStr of arr) {
            const [mm, dd, yyyy] = dStr.split("-").map(Number);
            const pick = dayjs(new Date(yyyy, mm-1, dd)).startOf("day");
            if (pick.isSame(nowDay, "day")) {
                return true;
            }
        }
        return false;
    }

    function showCutoffTimes() {
        $(".cutoff-time").each(function(){
            const track = $(this).data("track");
            if (track === "Venezuela") {
                return; // no cutoff displayed
            }
            let raw = "";
            if (cutoffTimes.USA[track]) {
                raw = cutoffTimes.USA[track];
            } else if (cutoffTimes["Santo Domingo"][track]) {
                raw = cutoffTimes["Santo Domingo"][track];
            } else if (cutoffTimes.Venezuela[track]) {
                raw = cutoffTimes.Venezuela[track];
            }
            if (raw) {
                let cO = dayjs(raw, "HH:mm");
                let cF;
                if (cO.isAfter(dayjs("21:30", "HH:mm"))) {
                    cF = dayjs("22:00", "HH:mm");
                } else {
                    cF = cO.subtract(10, "minute");
                }
                const hh = cF.format("HH");
                const mm = cF.format("mm");
                $(this).text(`Cutoff Time: ${hh}:${mm}`);
            }
        });
    }

    function disableTracksByTime() {
        if (!userChoseToday()) {
            enableAllTracks();
            return;
        }
        const now = dayjs();
        $(".track-checkbox").each(function(){
            const val = $(this).val();
            if (val === "Venezuela") {
                return; // always open
            }
            const raw = getTrackCutoff(val);
            if (raw) {
                let co = dayjs(raw, "HH:mm");
                let cF;
                if (co.isAfter(dayjs("21:30", "HH:mm"))) {
                    cF = dayjs("22:00", "HH:mm");
                } else {
                    cF = co.subtract(10, "minute");
                }
                if (now.isAfter(cF) || now.isSame(cF)) {
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

    function getTrackCutoff(trackName) {
        for (let region in cutoffTimes) {
            if (cutoffTimes[region][trackName]) {
                return cutoffTimes[region][trackName];
            }
        }
        return null;
    }

    function enableAllTracks() {
        $(".track-checkbox").each(function(){
            $(this).prop("disabled", false);
            $(this).closest(".form-check").find(".form-check-label").css({
                opacity: 1,
                cursor: "pointer"
            });
        });
    }

    function storeFormState() {
        const st = {
            playCount,
            selectedTracksCount,
            selectedDaysCount,
            dateVal: $("#fecha").val(),
            plays: []
        };
        $("#tablaJugadas tr").each(function(){
            const bn = $(this).find(".betNumber").val();
            const gm = $(this).find(".gameMode").text();
            const str = $(this).find(".straight").val();
            const bx  = $(this).find(".box").val();
            const co  = $(this).find(".combo").val();
            const tot = $(this).find(".total").text();
            st.plays.push({
                betNumber: bn,
                gameMode: gm,
                straight: str,
                box: bx,
                combo: co,
                total: tot
            });
        });
        localStorage.setItem("formState", JSON.stringify(st));
    }

    function loadFormState() {
        const data = JSON.parse(localStorage.getItem("formState"));
        if (data) {
            $("#fecha").val(data.dateVal);
            selectedDaysCount = data.selectedDaysCount;
            selectedTracksCount = data.selectedTracksCount;
            playCount = data.playCount;

            $("#tablaJugadas").empty();

            data.plays.forEach((p, i) => {
                if (i >= MAX_PLAYS) return;
                const row = `
                    <tr>
                        <td>${i+1}</td>
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
            if (playCount > MAX_PLAYS) {
                playCount = MAX_PLAYS;
            }
            calculateTotal();
            showCutoffTimes();
            disableTracksByTime();
            highlightDuplicates();
        }
    }

    loadFormState();

    $("#lotteryForm").on("reset", function(e){
        if (!isProgrammaticReset && (!e.originalEvent || !$(e.originalEvent.submitter).hasClass("btn-reset"))) {
            e.preventDefault();
        }
    });

    // "Generate Ticket" => preview but no QR or ticket ID
    $("#generarTicket").click(function(){
        const dateVal = $("#fecha").val();
        if (!dateVal) {
            alert("Please select at least one date.");
            return;
        }
        const chosenTracks = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
        if (!chosenTracks || chosenTracks.length === 0) {
            alert("Please select at least one track.");
            return;
        }
        const usaTracks = chosenTracks.filter(t => Object.keys(cutoffTimes.USA).includes(t));
        if (chosenTracks.includes("Venezuela") && usaTracks.length === 0) {
            alert("To play 'Venezuela', you must also select at least one track from 'USA'.");
            return;
        }

        // Check cutoff if user included today
        const arrDates = dateVal.split(", ");
        const today = dayjs().startOf("day");
        for (let ds of arrDates) {
            const [mm, dd, yyyy] = ds.split("-").map(Number);
            const picked = dayjs(new Date(yyyy, mm-1, dd)).startOf("day");
            if (picked.isSame(today, "day")) {
                const now = dayjs();
                for (let t of chosenTracks) {
                    if (t === "Venezuela") continue;
                    const raw = getTrackCutoff(t);
                    if (raw) {
                        let cO = dayjs(raw, "HH:mm");
                        let cF;
                        if (cO.isAfter(dayjs("21:30", "HH:mm"))) {
                            cF = dayjs("22:00", "HH:mm");
                        } else {
                            cF = cO.subtract(10, "minute");
                        }
                        if (now.isAfter(cF) || now.isSame(cF)) {
                            alert(`The track "${t}" is already closed for today. Choose another track or future date.`);
                            return;
                        }
                    }
                }
            }
        }

        // Validate each row
        let allValid = true;
        const errors = [];
        const rows = $("#tablaJugadas tr");
        rows.each(function(){
            const rowNum = parseInt($(this).find("td:first").text());
            const bn   = $(this).find(".betNumber").val();
            const mode = $(this).find(".gameMode").text();
            const str  = $(this).find(".straight").val();
            const bx   = $(this).find(".box").val();
            const co   = $(this).find(".combo").val();
            const tot  = $(this).find(".total").text();

            if (!bn || bn.length < 2 || bn.length > 4) {
                allValid = false;
                errors.push(rowNum);
                $(this).find(".betNumber").addClass("error-field");
            } else {
                $(this).find(".betNumber").removeClass("error-field");
            }

            // If Brooklyn/Front => must be exactly 3 digits
            if (hasBrooklynOrFront(chosenTracks)) {
                if (bn.length !== 3) {
                    allValid = false;
                    errors.push(rowNum);
                }
            }

            if (mode === "-") {
                allValid = false;
                errors.push(rowNum);
            }

            if (["Venezuela", "Venezuela-Pale", "Pulito", "RD-Quiniela", "RD-Pale"].includes(mode)) {
                if (!str || parseFloat(str) <= 0) {
                    allValid = false;
                    errors.push(rowNum);
                    $(this).find(".straight").addClass("error-field");
                } else {
                    $(this).find(".straight").removeClass("error-field");
                }
                if (mode === "Pulito") {
                    if (!bx) {
                        allValid = false;
                        errors.push(rowNum);
                        $(this).find(".box").addClass("error-field");
                    } else {
                        $(this).find(".box").removeClass("error-field");
                    }
                }
            }
            else if (["Win 4", "Pick 3"].includes(mode)) {
                if ((!str || parseFloat(str) <= 0) &&
                    (!bx || parseFloat(bx) <= 0) &&
                    (!co || parseFloat(co) <= 0)) {
                    allValid = false;
                    errors.push(rowNum);
                    $(this).find(".straight").addClass("error-field");
                    $(this).find(".box").addClass("error-field");
                    $(this).find(".combo").addClass("error-field");
                } else {
                    if (str && parseFloat(str) > 0) {
                        $(this).find(".straight").removeClass("error-field");
                    }
                    if (bx && parseFloat(bx) > 0) {
                        $(this).find(".box").removeClass("error-field");
                    }
                    if (co && parseFloat(co) > 0) {
                        $(this).find(".combo").removeClass("error-field");
                    }
                }
            }
        });

        if (!allValid) {
            const uniqueErr = [...new Set(errors)].join(", ");
            alert(`Some plays have errors (row(s): ${uniqueErr}). Please fix them before generating the ticket preview.`);
            return;
        }

        // Fill the modal table WITHOUT ticket number or QR
        $("#ticketTracks").text(chosenTracks.join(", "));
        $("#ticketJugadas").empty();

        rows.each(function(){
            const rowNum = $(this).find("td:first").text();
            const bn  = $(this).find(".betNumber").val();
            const mod = $(this).find(".gameMode").text();
            const stVal = parseFloat($(this).find(".straight").val()) || 0;
            let boxVal  = $(this).find(".box").val() || "";
            if (boxVal === "") boxVal = "-";
            const coVal  = parseFloat($(this).find(".combo").val()) || 0;
            const rowTot = parseFloat($(this).find(".total").text()) || 0;

            const rowHTML = `
                <tr>
                    <td>${rowNum}</td>
                    <td>${bn}</td>
                    <td>${mod}</td>
                    <td>${stVal > 0 ? stVal.toFixed(2) : "-"}</td>
                    <td>${boxVal !== "-" ? boxVal : "-"}</td>
                    <td>${coVal > 0 ? coVal.toFixed(2) : "-"}</td>
                    <td>${rowTot.toFixed(2)}</td>
                </tr>
            `;
            $("#ticketJugadas").append(rowHTML);
        });

        $("#ticketTotal").text($("#totalJugadas").text());
        // We'll just show today's time as "preview" 
        $("#ticketTransaccion").text(dayjs().format("MM/DD/YYYY hh:mm A"));
        $("#numeroTicket").text("(Not assigned yet)");
        $("#qrcode").empty();

        // Force horizontal table layout for the preview (especially on mobile)
        fixTicketLayoutForMobile();

        // Show the modal
        ticketModal.show();
        storeFormState();
    });

    // "Confirm & Download" => now generate the final unique ticket + QR
    $("#confirmarTicket").click(function(){
        const confirmBtn = $(this);
        confirmBtn.prop("disabled", true);

        // Generate the unique 8-digit ticket number
        const uniqueTicket = generateUniqueTicketNumber();
        $("#numeroTicket").text(uniqueTicket);

        transactionDateTime = dayjs().format("MM/DD/YYYY hh:mm A");
        $("#ticketTransaccion").text(transactionDateTime);

        // Actually create the QR code
        $("#qrcode").empty();
        new QRCode(document.getElementById("qrcode"), {
            text: uniqueTicket,
            width: 128,
            height: 128
        });

        // Again ensure horizontal layout
        fixTicketLayoutForMobile();

        const ticketElement = document.getElementById("preTicket");
        const origStyles = {
            width: $(ticketElement).css("width"),
            height: $(ticketElement).css("height"),
            maxHeight: $(ticketElement).css("max-height"),
            overflowY: $(ticketElement).css("overflow-y")
        };
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

                    // Auto-download
                    const link = document.createElement("a");
                    link.href = dataUrl;
                    link.download = `ticket_${uniqueTicket}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    alert("Your ticket image was downloaded successfully.");

                    // Save bet data to SheetDB
                    saveBetDataToSheetDB(uniqueTicket, (success) => {
                        if (success) {
                            console.log("Bet data successfully sent to SheetDB.");
                        } else {
                            console.error("Failed to send bet data to SheetDB.");
                        }
                    });

                    // Print is commented out since it's not needed
                    // window.print();
                    
                    // Show share button
                    $("#shareTicket").removeClass("d-none");
                })
                .catch(error => {
                    console.error("Error capturing ticket:", error);
                    alert("There was a problem generating the final ticket image. Please try again.");
                })
                .finally(() => {
                    $(ticketElement).css(origStyles);
                    confirmBtn.prop("disabled", false);
                });
        }, 500);
    });

    // "Share Ticket" => Web Share API
    $("#shareTicket").click(async function(){
        if (!window.ticketImageDataUrl) {
            alert("No ticket image is available to share.");
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
                        text: "Sharing Ticket"
                    });
                } else {
                    alert("Your browser does not support file sharing. Please share the downloaded image manually.");
                }
            } catch(err) {
                console.error("Error sharing ticket:", err);
                alert("Could not share the ticket image. Please try manually.");
            }
        } else {
            alert("Your browser doesn't support the Web Share API with files. Please share manually.");
        }
    });

    // Build final bet data for saving
    function saveBetDataToSheetDB(uniqueTicket, callback) {
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
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ data: betData })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`SheetDB error, status ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Data stored in SheetDB:", data);
            callback(true);
        })
        .catch(error => {
            console.error("Error posting to SheetDB:", error);
            callback(false);
        });
    }

    function generateUniqueTicketNumber() {
        return Math.floor(10000000 + Math.random() * 90000000).toString();
    }

    showCutoffTimes();
    disableTracksByTime();
    setInterval(disableTracksByTime, 60000);

});
