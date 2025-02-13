 // scripts.js

/*
  Final refinement so that:
  - Once the user is in the FINAL ticket stage (with QR code + ticket number),
    the "Edit" button is definitely hidden.
  - That button only appears in the PREVIEW modal (after "Generate Ticket"),
    and once "Confirm & Download" is clicked, it gets removed.

  Other existing logic remains:
   - Confirm button is disabled after first click.
   - Only the "Share Ticket" remains visible in the final stage.
   - The user must close the modal manually if they want to return to the form 
     (or they can press X in the modal header).
*/

/* Replace with your real SheetDB (or API) endpoint */
const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/bl57zyh73b0ev';

let transactionDateTime = '';
let betData = [];
let isProgrammaticReset = false;
window.ticketImageDataUrl = null;

$(document).ready(function() {

    // Initialize Flatpickr
    flatpickr("#fecha", {
        mode: "multiple",
        dateFormat: "m-d-Y",
        minDate: "today",
        clickOpens: true,
        allowInput: false,
        appendTo: document.body,
        onReady: function(selectedDates, dateStr, instance) {
            instance.calendarContainer.style.zIndex = 999999;
        },
        onChange: function(selectedDates, dateStr, instance) {
            selectedDaysCount = selectedDates.length;
            calculateTotal();
            storeFormState();
            disableTracksByTime();
        }
    });

    let playCount = 0;
    let selectedTracksCount = 0;
    let selectedDaysCount = 0;
    const MAX_PLAYS = 25;

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
            "Venezuela": "00:00"
        }
    };

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
      Force horizontal layout in the final ticket
    */
    function fixTicketLayoutForMobile() {
        $("#preTicket table, #preTicket th, #preTicket td").css("white-space", "nowrap");
        $("#preTicket").css("overflow-x", "auto");
    }

    /*
      Determine the game mode from betNumber + chosen tracks
    */
    function determineGameMode(tracks, betNumber) {
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
      Add play row
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

    addPlayRow(); // start with one row

    /*
      Calculate total for the entire form
    */
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

    /*
      Calculate row total
    */
    function calculateRowTotal(row) {
        const mode = row.find(".gameMode").text();
        const bn   = row.find(".betNumber").val();
        if (!bn || bn.length < 2 || bn.length > 4) {
            row.find(".total").text("0.00");
            return;
        }

        let stVal  = parseFloat(row.find(".straight").val()) || 0;
        let boxTxt = row.find(".box").val() || "";
        let combo  = parseFloat(row.find(".combo").val()) || 0;

        if (betLimits[mode]) {
            stVal = Math.min(stVal, betLimits[mode].straight  ?? stVal);
            if (betLimits[mode].box !== undefined && mode !== "Pulito") {
                const numericBox = parseFloat(boxTxt) || 0;
                boxTxt = Math.min(numericBox, betLimits[mode].box).toString();
            }
            if (betLimits[mode].combo !== undefined) {
                combo = Math.min(combo, betLimits[mode].combo  ?? combo);
            }
        }

        let totalVal = 0;

        if (mode === "Pulito") {
            if (boxTxt) {
                const positions = boxTxt.split(",").map(v => v.trim()).filter(Boolean);
                totalVal = stVal * positions.length;
            }
        }
        else if (mode === "Venezuela" || mode.startsWith("RD-")) {
            totalVal = stVal;
        }
        else if (mode === "Win 4" || mode === "Pick 3") {
            const combosCount = calcCombos(bn);
            const numericBox = parseFloat(boxTxt) || 0;
            totalVal = stVal + numericBox + (combo * combosCount);
        }
        else {
            const numericBox = parseFloat(boxTxt) || 0;
            totalVal = stVal + numericBox + combo;
        }

        row.find(".total").text(totalVal.toFixed(2));
        calculateTotal();
    }

    function calcCombos(str) {
        const freq = {};
        for (let c of str) {
            freq[c] = (freq[c] || 0) + 1;
        }
        const factorial = n => (n <= 1 ? 1 : n * factorial(n - 1));
        let denom = 1;
        for (const k in freq) {
            denom *= factorial(freq[k]);
        }
        return factorial(str.length) / denom;
    }

    function hasBrooklynOrFront(tracks) {
        const bfSet = new Set(["Brooklyn Midday","Brooklyn Evening","Front Midday","Front Evening"]);
        return tracks.some(t => bfSet.has(t));
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
        const used = {};
        const dups = new Set();
        betFields.each(function(){
            const v = $(this).val().trim();
            if (v) {
                if (used[v]) {
                    dups.add(v);
                } else {
                    used[v] = true;
                }
            }
        });
        betFields.each(function(){
            const v = $(this).val().trim();
            if (dups.has(v)) {
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

    // Input event
    $("#tablaJugadas").on("input",".betNumber,.straight,.box,.combo",function(){
        const row = $(this).closest("tr");
        const bn  = row.find(".betNumber").val();
        const tracks = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
        const mode = determineGameMode(tracks, bn);
        row.find(".gameMode").text(mode);

        if (hasBrooklynOrFront(tracks)) {
            if (bn.length !== 3) {
                row.find(".total").text("0.00");
            }
        }
        updatePlaceholders(mode, row);
        calculateRowTotal(row);
        highlightDuplicates();
    });

    function updatePlaceholders(mode, row) {
        if (betLimits[mode]) {
            row.find(".straight").attr("placeholder", `Max $${betLimits[mode].straight ?? 100}`)
                                 .prop("disabled", false);
        } else {
            row.find(".straight").attr("placeholder", "e.g. 5.00").prop("disabled", false);
        }

        if (mode === "Pulito") {
            row.find(".box")
                .attr("placeholder","Positions (1,2,3)?")
                .prop("disabled",false);
            row.find(".combo")
                .attr("placeholder","N/A")
                .prop("disabled",true)
                .val("");
        }
        else if (mode === "Venezuela" || mode.startsWith("RD-")) {
            row.find(".box")
                .attr("placeholder","N/A")
                .prop("disabled",true)
                .val("");
            row.find(".combo")
                .attr("placeholder","N/A")
                .prop("disabled",true)
                .val("");
        }
        else if (mode === "Win 4" || mode === "Pick 3") {
            row.find(".box")
                .attr("placeholder",`Max $${betLimits[mode].box}`)
                .prop("disabled",false);
            row.find(".combo")
                .attr("placeholder",`Max $${betLimits[mode].combo}`)
                .prop("disabled",false);
        }
        else {
            row.find(".box")
                .attr("placeholder","e.g. 2.00")
                .prop("disabled",false);
            row.find(".combo")
                .attr("placeholder","e.g. 3.00")
                .prop("disabled",false);
        }
        storeFormState();
    }

    $(".track-checkbox").change(function(){
        const arr = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
        selectedTracksCount = arr.filter(x => x!=="Venezuela").length || 1;
        calculateTotal();
        disableTracksByTime();
    });

    const ticketModal = new bootstrap.Modal(document.getElementById("ticketModal"));

    function userChoseToday() {
        const val = $("#fecha").val();
        if (!val) return false;
        const arr = val.split(", ");
        const today = dayjs().startOf("day");
        for (let ds of arr) {
            const [mm, dd, yy] = ds.split("-").map(Number);
            const picked = dayjs(new Date(yy, mm-1, dd)).startOf("day");
            if (picked.isSame(today,"day")) {
                return true;
            }
        }
        return false;
    }

    function showCutoffTimes() {
        $(".cutoff-time").each(function(){
            const track = $(this).data("track");
            if(track==="Venezuela") {
                return;
            }
            let raw="";
            if(cutoffTimes.USA[track]) {
                raw=cutoffTimes.USA[track];
            } else if(cutoffTimes["Santo Domingo"][track]) {
                raw=cutoffTimes["Santo Domingo"][track];
            } else if(cutoffTimes.Venezuela[track]) {
                raw=cutoffTimes.Venezuela[track];
            }
            if(raw){
                let co=dayjs(raw,"HH:mm");
                let cf;
                if(co.isAfter(dayjs("21:30","HH:mm"))){
                    cf=dayjs("22:00","HH:mm");
                } else {
                    cf=co.subtract(10,"minute");
                }
                const hh=cf.format("HH");
                const mm=cf.format("mm");
                $(this).text(`Cutoff Time: ${hh}:${mm}`);
            }
        });
    }

    function disableTracksByTime() {
        if(!userChoseToday()){
            enableAllTracks();
            return;
        }
        const now=dayjs();
        $(".track-checkbox").each(function(){
            const val=$(this).val();
            if(val==="Venezuela")return;
            const raw=getTrackCutoff(val);
            if(raw){
                let co=dayjs(raw,"HH:mm");
                let cf;
                if(co.isAfter(dayjs("21:30","HH:mm"))){
                    cf=dayjs("22:00","HH:mm");
                } else {
                    cf=co.subtract(10,"minute");
                }
                if(now.isAfter(cf)||now.isSame(cf)){
                    $(this).prop("disabled",true).prop("checked",false);
                    $(this).closest(".form-check").find(".form-check-label").css({
                        opacity:0.5,
                        cursor:"not-allowed"
                    });
                }else{
                    $(this).prop("disabled",false);
                    $(this).closest(".form-check").find(".form-check-label").css({
                        opacity:1,
                        cursor:"pointer"
                    });
                }
            }
        });
        storeFormState();
    }

    function getTrackCutoff(tn){
        for(let region in cutoffTimes){
            if(cutoffTimes[region][tn]){
                return cutoffTimes[region][tn];
            }
        }
        return null;
    }

    function enableAllTracks(){
        $(".track-checkbox").each(function(){
            $(this).prop("disabled",false);
            $(this).closest(".form-check").find(".form-check-label").css({
                opacity:1,
                cursor:"pointer"
            });
        });
    }

    function storeFormState(){
        const st={
            playCount,
            selectedTracksCount,
            selectedDaysCount,
            dateVal:$("#fecha").val(),
            plays:[]
        };
        $("#tablaJugadas tr").each(function(){
            const bn=$(this).find(".betNumber").val();
            const gm=$(this).find(".gameMode").text();
            const s=$(this).find(".straight").val();
            const b=$(this).find(".box").val();
            const c=$(this).find(".combo").val();
            const tot=$(this).find(".total").text();
            st.plays.push({
                betNumber:bn,
                gameMode:gm,
                straight:s,
                box:b,
                combo:c,
                total:tot
            });
        });
        localStorage.setItem("formState",JSON.stringify(st));
    }

    function loadFormState(){
        const data=JSON.parse(localStorage.getItem("formState"));
        if(data){
            $("#fecha").val(data.dateVal);
            selectedDaysCount=data.selectedDaysCount;
            selectedTracksCount=data.selectedTracksCount;
            playCount=data.playCount;
            $("#tablaJugadas").empty();
            data.plays.forEach((p,i)=>{
                if(i>=MAX_PLAYS)return;
                const row=`
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
            if(playCount>MAX_PLAYS){
                playCount=MAX_PLAYS;
            }
            calculateTotal();
            showCutoffTimes();
            disableTracksByTime();
            highlightDuplicates();
        }
    }

    loadFormState();

    $("#lotteryForm").on("reset", function(e){
        if(!isProgrammaticReset && (!e.originalEvent||!$(e.originalEvent.submitter).hasClass("btn-reset"))){
            e.preventDefault();
        }
    });

    // Generate Ticket => preview
    $("#generarTicket").click(function(){
        const dateVal=$("#fecha").val();
        if(!dateVal){
            alert("Please select at least one date.");
            return;
        }
        const chosenTracks=$(".track-checkbox:checked").map(function(){return $(this).val();}).get();
        if(!chosenTracks||chosenTracks.length===0){
            alert("Please select at least one track.");
            return;
        }
        const usaTracks=chosenTracks.filter(t=>Object.keys(cutoffTimes.USA).includes(t));
        if(chosenTracks.includes("Venezuela")&&usaTracks.length===0){
            alert("To play 'Venezuela', you must also select at least one track from 'USA'.");
            return;
        }

        // Check cutoffs if user selected "today"
        const arrDates=dateVal.split(", ");
        const today=dayjs().startOf("day");
        for(let ds of arrDates){
            const [mm,dd,yy]=ds.split("-").map(Number);
            const picked=dayjs(new Date(yy,mm-1,dd)).startOf("day");
            if(picked.isSame(today,"day")){
                const now=dayjs();
                for(let t of chosenTracks){
                    if(t==="Venezuela")continue;
                    const raw=getTrackCutoff(t);
                    if(raw){
                        let co=dayjs(raw,"HH:mm");
                        let cf;
                        if(co.isAfter(dayjs("21:30","HH:mm"))){
                            cf=dayjs("22:00","HH:mm");
                        } else {
                            cf=co.subtract(10,"minute");
                        }
                        if(now.isAfter(cf)||now.isSame(cf)){
                            alert(`The track "${t}" is already closed for today. Choose another track or a future date.`);
                            return;
                        }
                    }
                }
            }
        }

        // Validate each row
        let valid=true;
        const errors=[];
        const rows=$("#tablaJugadas tr");
        rows.each(function(){
            const rowNum=parseInt($(this).find("td:first").text());
            const bn=$(this).find(".betNumber").val();
            const gm=$(this).find(".gameMode").text();
            const st=$(this).find(".straight").val();
            const bx=$(this).find(".box").val();
            const co=$(this).find(".combo").val();

            if(!bn||bn.length<2||bn.length>4){
                valid=false;
                errors.push(rowNum);
                $(this).find(".betNumber").addClass("error-field");
            } else {
                $(this).find(".betNumber").removeClass("error-field");
            }

            if(hasBrooklynOrFront(chosenTracks)){
                if(bn.length!==3){
                    valid=false;
                    errors.push(rowNum);
                }
            }

            if(gm==="-"){
                valid=false;
                errors.push(rowNum);
            }

            if(["Venezuela","Venezuela-Pale","Pulito","RD-Quiniela","RD-Pale"].includes(gm)){
                if(!st||parseFloat(st)<=0){
                    valid=false;
                    errors.push(rowNum);
                    $(this).find(".straight").addClass("error-field");
                } else {
                    $(this).find(".straight").removeClass("error-field");
                }
                if(gm==="Pulito"){
                    if(!bx){
                        valid=false;
                        errors.push(rowNum);
                        $(this).find(".box").addClass("error-field");
                    } else {
                        $(this).find(".box").removeClass("error-field");
                    }
                }
            }
            else if(["Win 4","Pick 3"].includes(gm)){
                if((!st||parseFloat(st)<=0) &&
                   (!bx||parseFloat(bx)<=0) &&
                   (!co||parseFloat(co)<=0)){
                    valid=false;
                    errors.push(rowNum);
                    $(this).find(".straight").addClass("error-field");
                    $(this).find(".box").addClass("error-field");
                    $(this).find(".combo").addClass("error-field");
                } else {
                    if(st&&parseFloat(st)>0){
                        $(this).find(".straight").removeClass("error-field");
                    }
                    if(bx&&parseFloat(bx)>0){
                        $(this).find(".box").removeClass("error-field");
                    }
                    if(co&&parseFloat(co)>0){
                        $(this).find(".combo").removeClass("error-field");
                    }
                }
            }
        });
        if(!valid){
            const uniqueErr=[...new Set(errors)].join(", ");
            alert(`Some plays have errors (row(s): ${uniqueErr}). Please fix them before generating the ticket preview.`);
            return;
        }

        // Fill the PREVIEW
        $("#ticketJugadas").empty();
        $("#ticketTracks").text(chosenTracks.join(", "));
        rows.each(function(){
            const rowNum=$(this).find("td:first").text();
            const bn=$(this).find(".betNumber").val();
            const gm=$(this).find(".gameMode").text();
            const stVal=parseFloat($(this).find(".straight").val())||0;
            let bxVal=$(this).find(".box").val()||"";
            if(bxVal==="") bxVal="-";
            const coVal=parseFloat($(this).find(".combo").val())||0;
            const rowT=parseFloat($(this).find(".total").text())||0;

            const rowHTML=`
                <tr>
                    <td>${rowNum}</td>
                    <td>${bn}</td>
                    <td>${gm}</td>
                    <td>${stVal>0?stVal.toFixed(2):"-"}</td>
                    <td>${bxVal!=="-"?bxVal:"-"}</td>
                    <td>${coVal>0?coVal.toFixed(2):"-"}</td>
                    <td>${rowT.toFixed(2)}</td>
                </tr>
            `;
            $("#ticketJugadas").append(rowHTML);
        });
        $("#ticketTotal").text($("#totalJugadas").text());
        $("#ticketTransaccion").text(dayjs().format("MM/DD/YYYY hh:mm A"));
        $("#numeroTicket").text("(Not assigned yet)");
        $("#qrcode").empty();

        // Show edit, hide share, enable confirm
        $("#editButton").removeClass("d-none");
        $("#shareTicket").addClass("d-none");
        $("#confirmarTicket").prop("disabled", false);

        fixTicketLayoutForMobile();
        ticketModal.show();
        storeFormState();
    });

    // "Confirm & Download"
    $("#confirmarTicket").click(function(){
        const confirmBtn=$(this);

        // Hide the edit button immediately => final stage
        $("#editButton").addClass("d-none");

        // Disable confirm so user can't re-click
        confirmBtn.prop("disabled", true);

        // Generate ticket number
        const uniqueTicket=generateUniqueTicketNumber();
        $("#numeroTicket").text(uniqueTicket);

        transactionDateTime=dayjs().format("MM/DD/YYYY hh:mm A");
        $("#ticketTransaccion").text(transactionDateTime);

        // QR code
        $("#qrcode").empty();
        new QRCode(document.getElementById("qrcode"),{
            text:uniqueTicket,
            width:128,
            height:128
        });

        // Show share now
        $("#shareTicket").removeClass("d-none");

        fixTicketLayoutForMobile();

        const ticketElement=document.getElementById("preTicket");
        const originalStyles={
            width:$(ticketElement).css("width"),
            height:$(ticketElement).css("height"),
            maxHeight:$(ticketElement).css("max-height"),
            overflowY:$(ticketElement).css("overflow-y")
        };

        $(ticketElement).css({
            width:"auto",
            height:"auto",
            maxHeight:"none",
            overflowY:"visible"
        });

        setTimeout(()=>{
            html2canvas(ticketElement,{scale:6})
            .then(canvas=>{
                const dataUrl=canvas.toDataURL("image/png");
                window.ticketImageDataUrl=dataUrl;

                // Download
                const link=document.createElement("a");
                link.href=dataUrl;
                link.download=`ticket_${uniqueTicket}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                alert("Your ticket image was downloaded successfully.");

                saveBetDataToSheetDB(uniqueTicket, success=>{
                    if(success){
                        console.log("Bet data successfully sent to SheetDB.");
                    } else {
                        console.error("Failed to send bet data to SheetDB.");
                    }
                });

                // window.print(); // commented

            })
            .catch(err=>{
                console.error("Error capturing ticket:",err);
                alert("There was a problem generating the final ticket image. Please try again.");
            })
            .finally(()=>{
                $(ticketElement).css(originalStyles);
                // We do NOT re-enable the confirm button => no repeated generation
            });
        },500);
    });

    // "Edit" => close modal
    $("#editButton").click(function(){
        // Return to form => user can fix data
        ticketModal.hide();
    });

    // "Share Ticket"
    $("#shareTicket").click(async function(){
        if(!window.ticketImageDataUrl){
            alert("No ticket image is available to share.");
            return;
        }
        if(navigator.canShare){
            try{
                const resp=await fetch(window.ticketImageDataUrl);
                const blob=await resp.blob();
                const file=new File([blob],"ticket.png",{type:"image/png"});
                if(navigator.canShare({files:[file]})){
                    await navigator.share({
                        files:[file],
                        title:"Ticket",
                        text:"Sharing Ticket"
                    });
                } else {
                    alert("Your browser does not support file sharing. Please share the downloaded image manually.");
                }
            }catch(err){
                console.error("Error sharing ticket:",err);
                alert("Could not share the ticket image. Please try manually.");
            }
        } else {
            alert("Your browser doesn't support the Web Share API with files. Please share manually.");
        }
    });

    function saveBetDataToSheetDB(uniqueTicket, callback){
        betData=[];
        const dateVal=$("#fecha").val()||"";
        const chosenTracks=$(".track-checkbox:checked").map(function(){return $(this).val();}).get();
        const joinedTracks=chosenTracks.join(", ");
        const nowISO=dayjs().toISOString();

        $("#tablaJugadas tr").each(function(){
            const rowNum=$(this).find("td:first").text();
            const betNumber=$(this).find(".betNumber").val();
            const mode=$(this).find(".gameMode").text();
            const straight=$(this).find(".straight").val();
            const box=$(this).find(".box").val();
            const combo=$(this).find(".combo").val();
            const total=$(this).find(".total").text();

            if(mode!=="-"){
                betData.push({
                    "Ticket Number": uniqueTicket,
                    "Transaction DateTime": transactionDateTime,
                    "Bet Dates":dateVal,
                    "Tracks":joinedTracks,
                    "Bet Number":betNumber,
                    "Game Mode":mode,
                    "Straight ($)":straight||"",
                    "Box ($)":box||"",
                    "Combo ($)":combo||"",
                    "Total ($)":total||"0.00",
                    "Row Number":rowNum,
                    "Timestamp":nowISO
                });
            }
        });

        console.log("Sending betData to SheetDB:",betData);

        fetch(SHEETDB_API_URL,{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({data:betData})
        })
        .then(r=>{
            if(!r.ok){
                throw new Error(`SheetDB error, status ${r.status}`);
            }
            return r.json();
        })
        .then(d=>{
            console.log("Data stored in SheetDB:",d);
            callback(true);
        })
        .catch(e=>{
            console.error("Error posting to SheetDB:",e);
            callback(false);
        });
    }

    function generateUniqueTicketNumber(){
        return Math.floor(10000000+Math.random()*90000000).toString();
    }

    showCutoffTimes();
    disableTracksByTime();
    setInterval(disableTracksByTime,60000);

});
