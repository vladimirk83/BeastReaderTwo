  /*
  scripts.js
  ------------------------------------
  KEY CHANGES:
  1) Main table (#jugadasTable) is now fully editable:
     - Each row has <input> for Bet Number, Straight, Box, Combo.
     - The "Game Mode" is auto-detected and displayed in a <td class="gameMode">.
     - The "Total" is auto-recalculated on input.

  2) Round Down logic: exactly 10 jugadas by varying exactly one digit from 0..9,
     or if first/last differ in all digits => do the "triple/quad pattern"
     (e.g. 000..999 => 000,111,222,...,999).

  3) Bet Dates now shown in ticket (set #ticketFecha to #fecha val in doGenerateTicket).

  4) Wizard Bet Number => type="number",
     wizardStraight => type="number", wizardCombo => type="number",
     wizardBox => type="text".

  5) Keep localStorage for main table, Quick Pick, editing, ticket generation as before.
*/

/* Replace with your real endpoint if needed */
const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/bl57zyh73b0ev';

$(document).ready(function(){
  // Extend dayjs
  dayjs.extend(dayjs_plugin_customParseFormat);
  dayjs.extend(dayjs_plugin_arraySupport);

  /* ============================
     GLOBALS
  ============================ */
  let transactionDateTime = '';
  let isProgrammaticReset = false;
  window.ticketImageDataUrl = null;

  let selectedTracksCount = 0;
  let selectedDaysCount = 0;
  const MAX_PLAYS = 25;

  let playCount = 0; // how many rows in main table
  // For wizard:
  let wizardCount = 0;

  // Candados in wizard
  const lockedFields = {
    straight: false,
    box: false,
    combo: false
  };

  /* ============================
     CUTOFF TIMES
  ============================ */
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

  /* ============================
     INIT FLATPICKR
  ============================ */
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
      calculateMainTotal();
      storeFormState();
      disableTracksByTime();
    }
  });

  /* ============================
     TRACKS CHECKBOXES
  ============================ */
  $(".track-checkbox").change(function(){
    const arr = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
    selectedTracksCount = arr.filter(x=> x!=="Venezuela").length || 1;
    calculateMainTotal();
    disableTracksByTime();
  });

  /* ============================
     MAIN TABLE LOGIC
     #jugadasTable => editable
  ============================ */

  // Add row => each row has inputs for BN, Straight, Box, Combo, plus a "GameMode" cell and "Total"
  function addMainRow() {
    if(playCount>=MAX_PLAYS){
      alert("You have reached 25 plays in the main form.");
      return null;
    }
    playCount++;
    const rowIndex = playCount;
    const rowHTML=`
      <tr data-playIndex="${rowIndex}">
        <td>
          <button type="button" class="btnRemovePlay removeMainBtn" data-row="${rowIndex}">
            ${rowIndex}
          </button>
        </td>
        <td>
          <input type="text" class="form-control betNumber" />
        </td>
        <td class="gameMode">-</td>
        <td>
          <input type="text" class="form-control straight" />
        </td>
        <td>
          <input type="text" class="form-control box" />
        </td>
        <td>
          <input type="text" class="form-control combo" />
        </td>
        <td class="total">0.00</td>
      </tr>
    `;
    $("#tablaJugadas").append(rowHTML);
    return $("#tablaJugadas tr[data-playIndex='"+rowIndex+"']");
  }

  // On "Add Play" => create a new row
  $("#agregarJugada").click(function(){
    const row = addMainRow();
    if(row) row.find(".betNumber").focus();
  });

  // On "Remove Last Play"
  $("#eliminarJugada").click(function(){
    if(playCount===0){
      alert("No plays to remove.");
      return;
    }
    $("#tablaJugadas tr:last").remove();
    playCount--;
    renumberMainRows();
    calculateMainTotal();
  });

  // Remove row by clicking the red button in # col
  $("#tablaJugadas").on("click",".removeMainBtn",function(){
    $(this).closest("tr").remove();
    playCount--;
    renumberMainRows();
    calculateMainTotal();
  });

  // Renumber main rows
  function renumberMainRows(){
    let i=0;
    $("#tablaJugadas tr").each(function(){
      i++;
      $(this).attr("data-playIndex", i);
      $(this).find(".removeMainBtn").attr("data-row", i).text(i);
    });
    playCount=i;
    storeFormState();
  }

  // On input => recalc game mode & total
  $("#tablaJugadas").on("input",".betNumber,.straight,.box,.combo",function(){
    const row = $(this).closest("tr");
    recalcMainRow(row);
    storeFormState();
  });

  function recalcMainRow($row){
    // get betNumber
    const bn = $row.find(".betNumber").val().trim();
    const gm = determineGameMode(bn);
    $row.find(".gameMode").text(gm);

    const stVal = $row.find(".straight").val().trim();
    const bxVal = $row.find(".box").val().trim();
    const coVal = $row.find(".combo").val().trim();

    const rowTotal = calculateRowTotal(bn, gm, stVal, bxVal, coVal);
    $row.find(".total").text(rowTotal);
    calculateMainTotal();
  }

  function calculateMainTotal(){
    let sum=0;
    $("#tablaJugadas tr").each(function(){
      const total = parseFloat($(this).find(".total").text())||0;
      sum+= total;
    });
    if(selectedDaysCount===0) {
      sum=0;
    } else {
      sum = sum * selectedTracksCount * selectedDaysCount;
    }
    $("#totalJugadas").text(sum.toFixed(2));
    storeFormState();
  }


  /* ============================
     DETERMINE GAME MODE
  ============================ */
  function determineGameMode(betNumber){
    if(!betNumber || betNumber.length<2 || betNumber.length>4) return "-";
    const tracks = $(".track-checkbox:checked").map(function(){return $(this).val();}).get();
    const isUSA = tracks.some(t => cutoffTimes.USA[t]);
    const isSD  = tracks.some(t => cutoffTimes["Santo Domingo"][t]);
    const includesVenezuela = tracks.includes("Venezuela");
    const length = betNumber.length;

    // same logic as your original
    if(includesVenezuela && isUSA){
      if(length===2) return "Venezuela";
      if(length===4) return "Venezuela-Pale";
    }
    else if(isUSA && !isSD){
      if(length===4) return "Win 4";
      if(length===3) return "Pick 3";
      if(length===2) return "Pulito";
    }
    else if(isSD && !isUSA){
      if(length===2) return "RD-Quiniela";
      if(length===4) return "RD-Pale";
    }
    return "-";
  }

  // function to compute total for one row
  function calculateRowTotal(bn, gm, stVal, bxVal, coVal){
    if(!bn || gm==="-") return "0.00";
    const st = parseFloat(stVal)||0;
    let box=0;
    const combo = parseFloat(coVal)||0;

    if(gm==="Pulito"){
      // box might be positions
      if(bxVal){
        const positions = bxVal.split(",").map(x=>x.trim()).filter(Boolean);
        return (st * positions.length).toFixed(2);
      }
      return "0.00";
    }
    if(gm==="Venezuela" || gm.startsWith("RD-")){
      return st.toFixed(2);
    }
    if(gm==="Win 4"||gm==="Pick 3"){
      const numericBox = parseFloat(bxVal)||0;
      const combosCount = calcCombos(bn);
      let total = st + numericBox + combo*combosCount;
      return total.toFixed(2);
    }
    else {
      const numericBox = parseFloat(bxVal)||0;
      let total= st+ numericBox + combo;
      return total.toFixed(2);
    }
  }

  function calcCombos(str){
    const freq={};
    for(let c of str){
      freq[c]=(freq[c]||0)+1;
    }
    const factorial = n=> n<=1?1 : n*factorial(n-1);
    let denom=1;
    for(let k in freq){
      denom*= factorial(freq[k]);
    }
    return factorial(str.length)/denom;
  }

  /* ============================
     LOCALSTORAGE
  ============================ */
  function storeFormState(){
    const st={
      selectedTracksCount,
      selectedDaysCount,
      dateVal: $("#fecha").val(),
      playCount,
      plays: []
    };
    $("#tablaJugadas tr").each(function(){
      const bn = $(this).find(".betNumber").val();
      const gm = $(this).find(".gameMode").text();
      const stv= $(this).find(".straight").val();
      const bxv= $(this).find(".box").val();
      const cov= $(this).find(".combo").val();
      const tot= $(this).find(".total").text();
      st.plays.push({
        betNumber:bn||"",
        gameMode:gm||"-",
        straight:stv||"",
        box:bxv||"",
        combo:cov||"",
        total:tot||"0.00"
      });
    });
    localStorage.setItem("formState",JSON.stringify(st));
  }

  function loadFormState(){
    const data=JSON.parse(localStorage.getItem("formState"));
    if(!data) return;
    $("#fecha").val(data.dateVal||"");
    selectedDaysCount= data.selectedDaysCount||0;
    selectedTracksCount= data.selectedTracksCount||1;
    playCount= data.playCount||0;

    $("#tablaJugadas").empty();
    let i=0;
    data.plays.forEach((p)=>{
      i++;
      const rowHTML=`
        <tr data-playIndex="${i}">
          <td>
            <button type="button"
              class="btnRemovePlay removeMainBtn"
              data-row="${i}">${i}</button>
          </td>
          <td>
            <input type="text" class="form-control betNumber" value="${p.betNumber||""}" />
          </td>
          <td class="gameMode">${p.gameMode||"-"}</td>
          <td>
            <input type="text" class="form-control straight" value="${p.straight||""}" />
          </td>
          <td>
            <input type="text" class="form-control box" value="${p.box||""}" />
          </td>
          <td>
            <input type="text" class="form-control combo" value="${p.combo||""}" />
          </td>
          <td class="total">${p.total||"0.00"}</td>
        </tr>
      `;
      $("#tablaJugadas").append(rowHTML);
    });
    playCount = i;
    recalcAllMainRows();
    calculateMainTotal();
  }

  function recalcAllMainRows(){
    $("#tablaJugadas tr").each(function(){
      recalcMainRow($(this));
    });
  }

  loadFormState();


  /* ============================
     RESET FORM
  ============================ */
  $("#resetForm").click(function(){
    if(confirm("Are you sure you want to reset the form?")){
      resetForm();
    }
  });
  function resetForm(){
    isProgrammaticReset=true;
    $("#lotteryForm")[0].reset();
    $("#tablaJugadas").empty();
    playCount=0;
    selectedTracksCount=0;
    selectedDaysCount=0;
    window.ticketImageDataUrl=null;
    $("#totalJugadas").text("0.00");
    localStorage.removeItem("formState");
    showCutoffTimes();
    disableTracksByTime();
    isProgrammaticReset=false;
  }

  /* ============================
     GENERATE TICKET
  ============================ */
  $("#generarTicket").click(function(){
    doGenerateTicket();
  });

  function doGenerateTicket(){
    const dateVal=$("#fecha").val()||"";
    if(!dateVal){
      alert("Please select at least one date.");
      return;
    }
    // set #ticketFecha => show in ticket
    $("#ticketFecha").text(dateVal);

    const chosenTracks=$(".track-checkbox:checked").map(function(){return $(this).val();}).get();
    if(chosenTracks.length===0){
      alert("Please select at least one track.");
      return;
    }
    $("#ticketTracks").text(chosenTracks.join(", "));

    // cutoff check if user chose "today"
    const arrDates=dateVal.split(", ");
    const today=dayjs().startOf("day");
    for(let ds of arrDates){
      const [mm,dd,yy]=ds.split("-").map(Number);
      const picked=dayjs(new Date(yy,mm-1,dd)).startOf("day");
      if(picked.isSame(today,"day")){
        const now=dayjs();
        for(let t of chosenTracks){
          if(t==="Venezuela") continue;
          const raw=getTrackCutoff(t);
          if(raw){
            let co=dayjs(raw,"HH:mm");
            let cf= co.isAfter(dayjs("21:30","HH:mm"))?
              dayjs("22:00","HH:mm"):
              co.subtract(10,"minute");
            if(now.isSame(cf)||now.isAfter(cf)){
              alert(`Track "${t}" is closed for today.`);
              return;
            }
          }
        }
      }
    }

    // Validate each row
    const rows = $("#tablaJugadas tr");
    let valid=true;
    const errors=[];
    rows.each(function(){
      const rowIndex = parseInt($(this).attr("data-playIndex"));
      const bn = $(this).find(".betNumber").val().trim();
      const gm = $(this).find(".gameMode").text();
      const st = $(this).find(".straight").val();
      const bx = $(this).find(".box").val();
      const co = $(this).find(".combo").val();

      // basic checks
      if(!bn || bn.length<2 || bn.length>4){
        valid=false; errors.push(rowIndex);
      }
      if(hasBrooklynOrFront(chosenTracks) && bn.length!==3){
        valid=false; errors.push(rowIndex);
      }
      if(gm==="-"){
        valid=false; errors.push(rowIndex);
      }
      if(["Venezuela","Venezuela-Pale","Pulito","RD-Quiniela","RD-Pale"].includes(gm)){
        if(!st || parseFloat(st)<=0){
          valid=false; errors.push(rowIndex);
        }
        if(gm==="Pulito" && !bx){
          valid=false; errors.push(rowIndex);
        }
      }
      else if(["Win 4","Pick 3"].includes(gm)){
        const sVal=parseFloat(st)||0;
        const bVal=parseFloat(bx)||0;
        const cVal=parseFloat(co)||0;
        if(sVal<=0 && bVal<=0 && cVal<=0){
          valid=false; errors.push(rowIndex);
        }
      }
    });
    if(!valid){
      const uniqueErr=[...new Set(errors)].join(", ");
      alert(`Some plays have errors (row(s): ${uniqueErr}). Please fix them.`);
      return;
    }

    // fill ticket table
    $("#ticketJugadas").empty();
    rows.each(function(){
      const rowIndex=$(this).attr("data-playIndex");
      const bn = $(this).find(".betNumber").val().trim();
      const gm = $(this).find(".gameMode").text();
      let stVal= $(this).find(".straight").val().trim();
      let bxVal= $(this).find(".box").val().trim();
      let coVal= $(this).find(".combo").val().trim();
      let totVal= $(this).find(".total").text();

      if(!stVal || stVal==="") stVal="0.00";
      if(!bxVal || bxVal==="") bxVal="-";
      if(!coVal || coVal==="") coVal="0.00";
      if(!totVal) totVal="0.00";

      const rowHTML=`
        <tr>
          <td>${rowIndex}</td>
          <td>${bn}</td>
          <td>${gm}</td>
          <td>${parseFloat(stVal).toFixed(2)}</td>
          <td>${bxVal==="-"?"-":bxVal}</td>
          <td>${parseFloat(coVal).toFixed(2)}</td>
          <td>${parseFloat(totVal).toFixed(2)}</td>
        </tr>
      `;
      $("#ticketJugadas").append(rowHTML);
    });
    $("#ticketTotal").text($("#totalJugadas").text());
    $("#ticketTransaccion").text(dayjs().format("MM/DD/YYYY hh:mm A"));
    $("#numeroTicket").text("(Not assigned yet)");
    $("#qrcode").empty();

    const ticketModal=new bootstrap.Modal(document.getElementById("ticketModal"));
    $("#editButton").removeClass("d-none");
    $("#shareTicket").addClass("d-none");
    $("#confirmarTicket").prop("disabled",false);
    fixTicketLayoutForMobile();
    ticketModal.show();
    storeFormState();
  }

  // confirm & print
  $("#confirmarTicket").click(function(){
    $(this).prop("disabled",true);
    $("#editButton").addClass("d-none");

    const uniqueTicket = generateUniqueTicketNumber();
    $("#numeroTicket").text(uniqueTicket);
    transactionDateTime = dayjs().format("MM/DD/YYYY hh:mm A");
    $("#ticketTransaccion").text(transactionDateTime);

    // generate QR
    $("#qrcode").empty();
    new QRCode(document.getElementById("qrcode"),{
      text: uniqueTicket,
      width:128,
      height:128
    });

    $("#shareTicket").removeClass("d-none");

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
      html2canvas(ticketElement,{scale:4})
      .then(canvas=>{
        const dataUrl=canvas.toDataURL("image/png");
        window.ticketImageDataUrl=dataUrl;
        // auto download
        const link=document.createElement("a");
        link.href=dataUrl;
        link.download=`ticket_${uniqueTicket}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        alert("Your ticket image was downloaded successfully.");

        // Save to SheetDB
        saveBetDataToSheetDB(uniqueTicket, success=>{
          if(success){
            console.log("Bet data sent to SheetDB.");
          } else {
            console.error("Failed to send bet data to SheetDB.");
          }
        });
      })
      .catch(err=>{
        console.error(err);
        alert("Problem generating the final ticket image. Try again.");
      })
      .finally(()=>{
        $(ticketElement).css(originalStyles);
      });
    },500);
  });

  $("#editButton").click(function(){
    const ticketModal=bootstrap.Modal.getInstance(document.getElementById("ticketModal"));
    ticketModal.hide();
  });

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
          await navigator.share({files:[file], title:"Ticket", text:"Sharing Ticket"});
        } else {
          alert("Your browser does not support file sharing. Please share the downloaded image manually.");
        }
      }catch(err){
        console.error(err);
        alert("Could not share the ticket image. Please try manually.");
      }
    } else {
      alert("Your browser doesn't support the Web Share API with files. Please share manually.");
    }
  });


  function generateUniqueTicketNumber(){
    return Math.floor(10000000+Math.random()*90000000).toString();
  }
  function fixTicketLayoutForMobile(){
    $("#preTicket table, #preTicket th, #preTicket td").css("white-space","nowrap");
    $("#preTicket").css("overflow-x","auto");
  }

  // SheetDB
  function saveBetDataToSheetDB(uniqueTicket, callback){
    const dateVal=$("#fecha").val()||"";
    const chosenTracks=$(".track-checkbox:checked").map(function(){return $(this).val();}).get();
    const joinedTracks=chosenTracks.join(", ");
    const nowISO=dayjs().toISOString();
    let betData=[];

    $("#tablaJugadas tr").each(function(){
      const rowIndex=$(this).attr("data-playIndex");
      const bn = $(this).find(".betNumber").val();
      const gm = $(this).find(".gameMode").text();
      const st = $(this).find(".straight").val();
      const bx = $(this).find(".box").val();
      const co = $(this).find(".combo").val();
      const tot= $(this).find(".total").text();

      if(gm!=="-"){
        betData.push({
          "Ticket Number": uniqueTicket,
          "Transaction DateTime": transactionDateTime,
          "Bet Dates": dateVal,
          "Tracks": joinedTracks,
          "Bet Number": bn||"",
          "Game Mode": gm,
          "Straight ($)": st||"",
          "Box ($)": bx||"",
          "Combo ($)": co||"",
          "Total ($)": tot||"0.00",
          "Row Number": rowIndex,
          "Timestamp": nowISO
        });
      }
    });

    fetch(SHEETDB_API_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ data: betData })
    })
    .then(r=>{
      if(!r.ok) throw new Error(`SheetDB error: ${r.status}`);
      return r.json();
    })
    .then(d=>{
      console.log("Data stored in SheetDB:",d);
      callback(true);
    })
    .catch(e=>{
      console.error(e);
      callback(false);
    });
  }

  function getTrackCutoff(tn){
    for(let region in cutoffTimes){
      if(cutoffTimes[region][tn]){
        return cutoffTimes[region][tn];
      }
    }
    return null;
  }
  function hasBrooklynOrFront(tracks){
    const bfSet=new Set(["Brooklyn Midday","Brooklyn Evening","Front Midday","Front Evening"]);
    return tracks.some(t=>bfSet.has(t));
  }
  function userChoseToday(){
    const val=$("#fecha").val();
    if(!val) return false;
    const arr=val.split(", ");
    const today=dayjs().startOf("day");
    for(let ds of arr){
      const [mm,dd,yy]=ds.split("-").map(Number);
      const picked=dayjs(new Date(yy, mm-1, dd)).startOf("day");
      if(picked.isSame(today,"day")) return true;
    }
    return false;
  }
  function disableTracksByTime(){
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
        let cf= co.isAfter(dayjs("21:30","HH:mm"))
                 ? dayjs("22:00","HH:mm")
                 : co.subtract(10,"minute");
        if(now.isSame(cf)||now.isAfter(cf)){
          $(this).prop("checked",false).prop("disabled",true);
          $(this).closest(".track-button-container").find(".track-button").css({
            opacity:0.5,
            cursor:"not-allowed"
          });
        } else {
          $(this).prop("disabled",false);
          $(this).closest(".track-button-container").find(".track-button").css({
            opacity:1,
            cursor:"pointer"
          });
        }
      }
    });
    storeFormState();
  }
  function enableAllTracks(){
    $(".track-checkbox").each(function(){
      $(this).prop("disabled",false);
      $(this).closest(".track-button-container").find(".track-button").css({
        opacity:1,
        cursor:"pointer"
      });
    });
  }

  showCutoffTimes();
  disableTracksByTime();
  setInterval(disableTracksByTime,60000);

  function showCutoffTimes(){
    $(".cutoff-time").each(function(){
      const track=$(this).data("track");
      if(track==="Venezuela") return;
      let raw="";
      if(cutoffTimes.USA[track]){
        raw=cutoffTimes.USA[track];
      } else if(cutoffTimes["Santo Domingo"][track]){
        raw=cutoffTimes["Santo Domingo"][track];
      } else if(cutoffTimes.Venezuela[track]){
        raw=cutoffTimes.Venezuela[track];
      }
      if(raw){
        let co=dayjs(raw,"HH:mm");
        let cf= co.isAfter(dayjs("21:30","HH:mm"))
                 ? dayjs("22:00","HH:mm")
                 : co.subtract(10,"minute");
        const hh=cf.format("HH");
        const mm=cf.format("mm");
        $(this).text(`${hh}:${mm}`);
      }
    });
  }


  /* ============================
     WIZARD
  ============================ */
  const wizardModal=new bootstrap.Modal(document.getElementById("wizardModal"));

  $("#wizardButton").click(function(){
    resetWizard();
    wizardModal.show();
  });

  function resetWizard(){
    wizardCount=0;
    $("#wizardTableBody").empty();
    lockedFields.straight=false;
    lockedFields.box=false;
    lockedFields.combo=false;
    $("#lockStraight").html(`<i class="bi bi-unlock"></i>`);
    $("#lockBox").html(`<i class="bi bi-unlock"></i>`);
    $("#lockCombo").html(`<i class="bi bi-unlock"></i>`);
    $("#wizardBetNumber").val("");
    $("#wizardStraight").val("");
    $("#wizardBox").val("");
    $("#wizardCombo").val("");
    $("#qpGameMode").val("Pick 3");
    $("#qpCount").val("5");
    $("#rdFirstNumber").val("");
    $("#rdLastNumber").val("");
  }

  // toggle candados
  $(".lockBtn").click(function(){
    const field=$(this).data("field");
    lockedFields[field]=!lockedFields[field];
    if(lockedFields[field]){
      $(this).html(`<i class="bi bi-lock-fill"></i>`);
    } else {
      $(this).html(`<i class="bi bi-unlock"></i>`);
    }
  });

  // Add & Next
  $("#wizardAddNext").click(function(){
    const bn=$("#wizardBetNumber").val().trim();
    if(bn.length<2||bn.length>4){
      alert("Bet Number must be 2-4 digits.");
      return;
    }
    const gm=determineGameMode(bn);
    if(gm==="-"){
      alert(`Cannot determine game mode for number ${bn}. Check tracks or length.`);
      return;
    }
    let stVal = lockedFields.straight? $("#wizardStraight").val().trim() : $("#wizardStraight").val().trim();
    let bxVal = lockedFields.box? $("#wizardBox").val().trim() : $("#wizardBox").val().trim();
    let coVal = lockedFields.combo? $("#wizardCombo").val().trim() : $("#wizardCombo").val().trim();

    const rowT= calculateRowTotal(bn, gm, stVal, bxVal, coVal);

    addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);

    // If candado open => clear
    $("#wizardBetNumber").val("");
    if(!lockedFields.straight) $("#wizardStraight").val("");
    if(!lockedFields.box) $("#wizardBox").val("");
    if(!lockedFields.combo) $("#wizardCombo").val("");

    $("#wizardBetNumber").focus();
  });

  function addWizardRow(bn,gm,stVal,bxVal,coVal,total){
    wizardCount++;
    const i=wizardCount;
    const rowHTML=`
      <tr data-wizardIndex="${i}">
        <td>
          <button type="button" class="removeWizardBtn btnRemovePlay" data-row="${i}">${i}</button>
        </td>
        <td>${bn}</td>
        <td>${gm}</td>
        <td>${stVal||"-"}</td>
        <td>${bxVal||"-"}</td>
        <td>${coVal||"-"}</td>
        <td>${parseFloat(total||0).toFixed(2)}</td>
      </tr>
    `;
    $("#wizardTableBody").append(rowHTML);
  }

  // remove row in wizard
  $("#wizardTableBody").on("click",".removeWizardBtn",function(){
    $(this).closest("tr").remove();
    renumberWizard();
  });
  function renumberWizard(){
    let i=0;
    $("#wizardTableBody tr").each(function(){
      i++;
      $(this).attr("data-wizardIndex",i);
      $(this).find(".removeWizardBtn").attr("data-row",i).text(i);
    });
    wizardCount=i;
  }

  // Quick Pick
  $("#btnGenerateQuickPick").click(function(){
    const gm=$("#qpGameMode").val();
    const countVal = parseInt($("#qpCount").val())||1;
    if(countVal<1 || countVal>25){
      alert("Please enter a count between 1 and 25.");
      return;
    }
    const stVal= lockedFields.straight? $("#wizardStraight").val().trim(): "";
    const bxVal= lockedFields.box? $("#wizardBox").val().trim(): "";
    const coVal= lockedFields.combo? $("#wizardCombo").val().trim(): "";

    for(let i=0;i<countVal;i++){
      let bn= generateRandomNumberForMode(gm);
      bn= padNumberForMode(bn, gm);
      let rowT= calculateRowTotal(bn, gm, stVal, bxVal, coVal);
      addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);
    }
  });
  function generateRandomNumberForMode(mode){
    if(mode==="Win 4"||mode==="Venezuela-Pale"||mode==="RD-Pale"){
      return Math.floor(Math.random()*10000);
    }
    if(mode==="Pick 3"){
      return Math.floor(Math.random()*1000);
    }
    if(mode==="Venezuela"||mode==="Pulito"||mode==="RD-Quiniela"){
      return Math.floor(Math.random()*100);
    }
    return Math.floor(Math.random()*1000);
  }
  function padNumberForMode(num,mode){
    let length=3;
    if(mode==="Win 4"||mode==="Venezuela-Pale"||mode==="RD-Pale") length=4;
    if(mode==="Venezuela"||mode==="Pulito"||mode==="RD-Quiniela") length=2;
    let s=num.toString();
    while(s.length<length) s="0"+s;
    return s;
  }

  // Round Down => exactly 10 jugadas
  $("#btnGenerateRoundDown").click(function(){
    const firstNum=$("#rdFirstNumber").val().trim();
    const lastNum =$("#rdLastNumber").val().trim();
    if(!firstNum||!lastNum){
      alert("Please enter both first and last number for Round Down.");
      return;
    }
    if(firstNum.length!==lastNum.length){
      alert("First/Last must have the same length (2,3, or 4 digits).");
      return;
    }
    const len= firstNum.length;
    // compare each digit
    let diffPos=[];
    for(let i=0;i<len;i++){
      if(firstNum[i]!==lastNum[i]){
        diffPos.push(i);
      }
    }
    // If user typed "000" vs "999" => all digits differ => produce [000,111,...999]
    if(diffPos.length===len){
      // produce 10 lines repeating each digit
      for(let d=0; d<10; d++){
        let bn=(""+d).repeat(len);
        const gm=determineGameMode(bn);
        if(gm==="-"){
          alert(`Cannot determine game mode for number ${bn}. Check tracks or length.`);
          return;
        }
        const stVal= lockedFields.straight? $("#wizardStraight").val().trim(): "";
        const bxVal= lockedFields.box? $("#wizardBox").val().trim(): "";
        const coVal= lockedFields.combo? $("#wizardCombo").val().trim(): "";
        const rowT=calculateRowTotal(bn, gm, stVal, bxVal, coVal);
        addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);
      }
      return;
    }
    // If exactly 1 position differs => vary that digit from 0..9
    if(diffPos.length===1){
      const pos= diffPos[0];
      const prefix= firstNum.split("");
      const gm= determineGameMode(firstNum);
      if(gm==="-"){
        alert(`Cannot determine game mode for ${firstNum} in Round Down. Check tracks or length.`);
        return;
      }
      const stVal= lockedFields.straight? $("#wizardStraight").val().trim(): "";
      const bxVal= lockedFields.box? $("#wizardBox").val().trim(): "";
      const coVal= lockedFields.combo? $("#wizardCombo").val().trim(): "";
      for(let d=0; d<10; d++){
        prefix[pos]= String(d);
        const bn= prefix.join("");
        const rowT= calculateRowTotal(bn, gm, stVal, bxVal, coVal);
        addWizardRow(bn, gm, stVal, bxVal, coVal, rowT);
      }
      return;
    }
    // otherwise => error
    alert("Round Down expects either exactly 1 digit difference, or all digits differ (like 000..999).");
  });

  // Add All to Main
  $("#wizardAddAllToMain").click(function(){
    const wizardRows=$("#wizardTableBody tr");
    if(wizardRows.length===0){
      alert("No plays in the wizard table.");
      return;
    }
    wizardRows.each(function(){
      if(playCount>=MAX_PLAYS){
        alert("Reached 25 plays in the main form. Stopping import.");
        return false;
      }
      const tds=$(this).find("td");
      const bn=tds.eq(1).text();
      const gm=tds.eq(2).text();
      const stVal=(tds.eq(3).text()==="-"?"":tds.eq(3).text());
      const bxVal=(tds.eq(4).text()==="-"?"":tds.eq(4).text());
      const coVal=(tds.eq(5).text()==="-"?"":tds.eq(5).text());
      const total=tds.eq(6).text();

      if(playCount<MAX_PLAYS){
        playCount++;
        const rowIndex=playCount;
        const rowHTML=`
          <tr data-playIndex="${rowIndex}">
            <td>
              <button type="button" class="btnRemovePlay removeMainBtn" data-row="${rowIndex}">
                ${rowIndex}
              </button>
            </td>
            <td>
              <input type="text" class="form-control betNumber" value="${bn}" />
            </td>
            <td class="gameMode">${gm}</td>
            <td>
              <input type="text" class="form-control straight" value="${stVal}" />
            </td>
            <td>
              <input type="text" class="form-control box" value="${bxVal}" />
            </td>
            <td>
              <input type="text" class="form-control combo" value="${coVal}" />
            </td>
            <td class="total">${parseFloat(total||0).toFixed(2)}</td>
          </tr>
        `;
        $("#tablaJugadas").append(rowHTML);
      }
    });
    $("#wizardTableBody").empty();
    wizardCount=0;
    recalcAllMainRows();
    calculateMainTotal();
    storeFormState();
  });

  // Generate Ticket from Wizard
  $("#wizardGenerateTicket").click(function(){
    // Add all to main
    $("#wizardAddAllToMain").trigger("click");
    // then generate
    wizardModal.hide();
    doGenerateTicket();
  });

  // Edit Main Form
  $("#wizardEditMainForm").click(function(){
    wizardModal.hide();
  });

  /* end doc ready */
});
