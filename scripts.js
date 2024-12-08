 // scripts.js

// Define the URL of your SheetDB API as a constant
const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/bl57zyh73b0ev'; // Replace with your actual URL

let fechaTransaccion = '';
let jugadasData = []; // Defined in the global scope

$(document).ready(function() {

    // Initialize Flatpickr with multiple date selection
    flatpickr("#fecha", {
        mode: "multiple",
        dateFormat: "m-d-Y", // Format MM-DD-YYYY
        minDate: "today",
        allowInput: true,
        onChange: function(selectedDates, dateStr, instance) {
            selectedDays = selectedDates.length;
            calcularTotal();
        },
    });

    let jugadaCount = 0;
    let selectedTracks = 0;
    let selectedDays = 0;

    // Closing times per track
    const horariosCierre = {
        "USA": {
            "New York Mid Day": "14:25",
            "New York Evening": "22:25",
            "Georgia Mid Day": "12:20",
            "Georgia Evening": "18:45",
            "New Jersey Mid Day": "12:54",
            "New Jersey Evening": "22:50",
            "Florida Mid Day": "13:25",
            "Florida Evening": "21:30",
            "Connecticut Mid Day": "13:35",
            "Connecticut Evening": "22:20",
            "Georgia Night": "23:20",
            "Pensilvania AM": "12:55",
            "Pensilvania PM": "18:20"
            // Note: "Venezuela" is excluded here
        },
        "Santo Domingo": {
            "Real": "12:45",
            "Gana mas": "14:25",
            "Loteka": "19:30",
            "Nacional": "20:30", // Sundays at 17:50
            "Quiniela Pale": "20:30", // Sundays at 15:30
            "Primera Día": "11:50",
            "Suerte Día": "12:20",
            "Lotería Real": "12:50",
            "Suerte Tarde": "17:50",
            "Lotedom": "17:50",
            "Primera Noche": "19:50",
            "Panama": "16:00",
            // Special closing times for Sundays
            "Quiniela Pale Domingo": "15:30",
            "Nacional Domingo": "17:50"
        },
        "Venezuela": {
            "Venezuela": "19:00" // Assuming a closing time for Venezuela
        }
    };

    // Betting limits per game mode
    const limitesApuesta = {
        "Win 4": { "straight": 6, "box": 30, "combo": 50 },
        "Peak 3": { "straight": 35, "box": 50, "combo": 70 },
        "Venezuela": { "straight": 100 },
        "Venezuela-Pale": { "straight": 100 },
        "Pulito": { "straight": 100 },
        "RD-Quiniela": { "straight": 100 }, // Updated to $100
        "RD-Pale": { "straight": 20 }, // Remains at $20
        "Combo": { "combo": 50 } // Added
    };

    /**
     * Determines the game mode based on selected tracks and the bet number.
     * @param {Array} tracks - Array of selected tracks.
     * @param {String} numero - Bet number.
     * @param {jQuery} fila - Row of the bet.
     * @returns {String} - Game mode.
     */
    function determinarModalidad(tracks, numero, fila) {
        let modalidad = "-";

        const esUSA = tracks.some(track => Object.keys(horariosCierre.USA).includes(track));
        const esSD = tracks.some(track => Object.keys(horariosCierre["Santo Domingo"]).includes(track));
        const incluyeVenezuela = tracks.includes("Venezuela");

        const longitud = numero.length;
        const boxValue = parseInt(fila.find(".box").val()) || 0;

        if (incluyeVenezuela && esUSA && longitud === 2) {
            modalidad = "Venezuela";
        } else if (esUSA && !esSD) {
            if (longitud === 4) {
                modalidad = "Win 4";
            } else if (longitud === 3) {
                modalidad = "Peak 3";
            } else if (longitud === 2 && [1, 2, 3].includes(boxValue)) {
                modalidad = "Pulito";
            }
        } else if (esSD && !esUSA) {
            if (longitud === 2) {
                modalidad = "RD-Quiniela";
            } else if (longitud === 4) {
                modalidad = "RD-Pale";
            }
        }

        return modalidad;
    }

    /**
     * Adds a new bet to the table.
     */
    function agregarJugada() {
        if (jugadaCount >= 100) {
            alert("You have reached the maximum of 100 bets.");
            return;
        }
        jugadaCount++;
        const fila = `
            <tr>
                <td>${jugadaCount}</td>
                <td><input type="number" class="form-control numeroApostado" min="0" max="9999" required></td>
                <td class="tipoJuego">-</td>
                <td><input type="number" class="form-control straight" min="0" max="100.00" step="1" placeholder="E.g., 5"></td>
                <td><input type="number" class="form-control box" min="1" max="3" step="1" placeholder="1, 2 or 3"></td>
                <td><input type="number" class="form-control combo" min="0" max="50.00" step="0.10" placeholder="E.g., 3.00"></td>
                <td class="total">0.00</td>
            </tr>
        `;
        $("#tablaJugadas").append(fila);
    }

    // Add an initial bet
    agregarJugada();

    /**
     * Calculates the total of all bets considering selected tracks and days.
     */
    function calcularTotal() {
        let total = 0;
        $(".total").each(function() {
            total += parseFloat($(this).text()) || 0;
        });

        // If no days are selected, the total is 0
        if (selectedDays === 0) {
            total = 0;
        } else {
            // Multiply by the number of selected tracks and days
            total = (total * selectedTracks * selectedDays).toFixed(2);
        }

        $("#totalJugadas").text(total);
    }

    /**
     * Calculates the total for a specific bet.
     * @param {jQuery} fila - Row of the bet.
     */
    function calcularTotalJugada(fila) {
        const modalidad = fila.find(".tipoJuego").text();
        const numero = fila.find(".numeroApostado").val();
        if (!numero || numero.length < 2 || numero.length > 4) {
            fila.find(".total").text("0.00");
            return;
        }

        const combinaciones = calcularCombinaciones(numero);
        let straight = parseFloat(fila.find(".straight").val()) || 0;
        let box = parseFloat(fila.find(".box").val()) || 0;
        let combo = parseFloat(fila.find(".combo").val()) || 0;

        // Apply limits based on the game mode
        if (limitesApuesta[modalidad]) {
            straight = Math.min(straight, limitesApuesta[modalidad].straight || straight);
            if (limitesApuesta[modalidad].box !== undefined && modalidad !== "Pulito") {
                box = Math.min(box, limitesApuesta[modalidad].box || box);
            }
            if (limitesApuesta[modalidad].combo !== undefined) {
                combo = Math.min(combo, limitesApuesta[modalidad].combo || combo);
            }
        }

        // Calculate total based on the game mode
        let total = 0;
        if (modalidad === "Pulito") {
            total = straight; // Do not add box
        } else if (modalidad === "Venezuela" || modalidad.startsWith("RD-")) {
            total = straight;
        } else if (modalidad === "Win 4" || modalidad === "Peak 3") {
            total = straight + box + (combo * combinaciones);
        } else if (modalidad === "Combo") { // Added
            total = combo; // Only add combo
        } else {
            // Unrecognized game mode
            total = straight + box + combo;
        }

        fila.find(".total").text(total.toFixed(2));
    }

    /**
     * Calculates the number of combinations possible for a given number.
     * @param {String} numero - Bet number.
     * @returns {Number} - Number of combinations.
     */
    function calcularCombinaciones(numero) {
        const counts = {};
        for (let char of numero) {
            counts[char] = (counts[char] || 0) + 1;
        }
        let factorial = (n) => n <= 1 ? 1 : n * factorial(n - 1);
        let totalDigits = numero.length;
        let denominator = 1;
        for (let digit in counts) {
            if (counts.hasOwnProperty(digit)) {
                denominator *= factorial(counts[digit]);
            }
        }
        return factorial(totalDigits) / denominator;
    }

    /**
     * Updates placeholders and field states based on the game mode.
     * @param {String} modalidad - Game mode.
     * @param {jQuery} fila - Row of the bet.
     */
    function actualizarPlaceholders(modalidad, fila) {
        if (limitesApuesta[modalidad]) {
            fila.find(".straight").attr("placeholder", `Max $${limitesApuesta[modalidad].straight}`).prop('disabled', false);
        } else {
            fila.find(".straight").attr("placeholder", "E.g., 5.00").prop('disabled', false);
        }

        if (modalidad === "Pulito") {
            fila.find(".box").attr("placeholder", "1, 2 or 3").prop('disabled', false);
            fila.find(".combo").attr("placeholder", "Not applicable").prop('disabled', true).val('');
        } else if (modalidad === "Venezuela" || modalidad.startsWith("RD-")) {
            fila.find(".box").attr("placeholder", "Not applicable").prop('disabled', true).val('');
            fila.find(".combo").attr("placeholder", "Not applicable").prop('disabled', true).val('');
        } else if (modalidad === "Win 4" || modalidad === "Peak 3") {
            fila.find(".box").attr("placeholder", `Max $${limitesApuesta[modalidad].box}`).prop('disabled', false);
            fila.find(".combo").attr("placeholder", `Max $${limitesApuesta[modalidad].combo}`).prop('disabled', false);
        } else if (modalidad === "Combo") { // Added
            fila.find(".straight").attr("placeholder", "Not applicable").prop('disabled', true).val('');
            fila.find(".box").attr("placeholder", "Not applicable").prop('disabled', true).val('');
            fila.find(".combo").attr("placeholder", `Max $${limitesApuesta.Combo.combo}`).prop('disabled', false);
        } else {
            // Unrecognized game mode
            fila.find(".box").attr("placeholder", "E.g., 2.50").prop('disabled', false);
            fila.find(".combo").attr("placeholder", "E.g., 3.00").prop('disabled', false);
        }
    }

    /**
     * Highlights duplicate bet numbers.
     */
    function resaltarDuplicados() {
        const camposNumeros = $('.numeroApostado');
        const valores = {};
        const duplicados = new Set();

        camposNumeros.each(function() {
            const valor = $(this).val().trim();
            if (valor) {
                if (valores[valor]) {
                    duplicados.add(valor);
                } else {
                    valores[valor] = true;
                }
            }
        });

        camposNumeros.each(function() {
            if (duplicados.has($(this).val().trim())) {
                $(this).addClass('duplicado');
            } else {
                $(this).removeClass('duplicado');
            }
        });
    }

    /**
     * Resets the form to its initial state.
     */
    function resetForm() {
        $("#lotteryForm")[0].reset();
        $("#tablaJugadas").empty();
        jugadaCount = 0;
        selectedTracks = 0;
        selectedDays = 0;
        agregarJugada();
        $("#totalJugadas").text("0.00");
        mostrarHorasLimite();
        resaltarDuplicados();
        deshabilitarTracksPorHora(); // Ensure tracks are re-checked/disabled after reset
    }

    /**
     * Calculates the total for a specific bet and updates the overall total.
     * @param {jQuery} fila - Row of the bet.
     */
    function calcularTotalJugadaAndUpdate(fila) {
        calcularTotalJugada(fila);
        calcularTotal();
    }

    // Event to add more bets
    $("#agregarJugada").click(function() {
        agregarJugada();
    });

    // Event to remove the last bet
    $("#eliminarJugada").click(function() {
        if (jugadaCount === 0) {
            alert("There are no bets to remove.");
            return;
        }
        $("#tablaJugadas tr:last").remove();
        jugadaCount--;
        $("#tablaJugadas tr").each(function(index) {
            $(this).find("td:first").text(index + 1);
        });
        calcularTotal();
    });

    $("#tablaJugadas").on("input", ".numeroApostado, .straight, .box, .combo", function() {
        const fila = $(this).closest("tr");
        const num = fila.find(".numeroApostado").val();
        const tracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        const modalidad = determinarModalidad(tracks, num, fila);
        fila.find(".tipoJuego").text(modalidad);
        actualizarPlaceholders(modalidad, fila);
        calcularTotalJugadaAndUpdate(fila);
        resaltarDuplicados();
    });

    $(".track-checkbox").change(function() {
        const tracksSeleccionados = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        selectedTracks = tracksSeleccionados.filter(track => track !== "Venezuela").length || 1;
        calcularTotal();
    });

    var ticketModal = new bootstrap.Modal(document.getElementById('ticketModal'));

    function obtenerHoraLimite(track) {
        for (let region in horariosCierre) {
            if (horariosCierre[region][track]) {
                return horariosCierre[region][track];
            }
        }
        return null;
    }

    function aumentarTamanoFuente() {
        // Increase font size to 18px (~1.125rem) to match the app title size
        $(".form-check-label").css("font-size", "1.125rem"); 
        $(".cutoff-time").css("font-size", "1.125rem");
    }

    function mostrarHorasLimite() {
        $(".cutoff-time").each(function() {
            const track = $(this).data("track");

            if (track === 'Venezuela') {
               $(this).hide();
               return;
            }             
            let cierreStr = "";
            if (horariosCierre.USA[track]) {
                cierreStr = horariosCierre.USA[track];
            } else if (horariosCierre["Santo Domingo"][track]) {
                cierreStr = horariosCierre["Santo Domingo"][track];
            } else if (horariosCierre.Venezuela[track]) {
                cierreStr = horariosCierre.Venezuela[track];
            }
            if (cierreStr) {
                const cierre = dayjs(cierreStr, "HH:mm");
                cierre.subtract(10, 'minute');
                const horas = cierre.format("HH");
                const minutos = cierre.format("mm");
                const horaLimite = `${horas}:${minutos}`;
                $(this).text(`Cutoff Time: ${horaLimite}`);
            }
        });
        aumentarTamanoFuente();
    }

    function deshabilitarTracksPorHora() {
        const ahora = dayjs();
        const limite = dayjs().hour(21).minute(30).second(0); // 9:30 PM

        if (ahora.isAfter(limite) || ahora.isSame(limite)) {
            $(".track-checkbox").each(function() {
                const track = $(this).val();
                const cierreStr = obtenerHoraLimite(track);
                if (cierreStr) {
                    const cierre = dayjs(cierreStr, "HH:mm");
                    if (cierre.isAfter(dayjs("21:30", "HH:mm"))) {
                        $(this).prop('disabled', true).prop('checked', false); // Uncheck and disable expired
                        $(this).closest('.form-check').find('.form-check-label').css('opacity', '0.5').css('cursor', 'not-allowed');
                    }
                }
            });
        } else {
            $(".track-checkbox").each(function() {
                const track = $(this).val();
                const cierreStr = obtenerHoraLimite(track);
                if (cierreStr) {
                    const cierre = dayjs(cierreStr, "HH:mm");
                    if (cierre.isAfter(dayjs("21:30", "HH:mm"))) {
                        $(this).prop('disabled', false);
                        $(this).closest('.form-check').find('.form-check-label').css('opacity', '1').css('cursor', 'pointer');
                    }
                }
            });
        }
    }

    // Display closing times upon page load
    mostrarHorasLimite();

    // Check and disable tracks upon page load
    deshabilitarTracksPorHora();

    // Set an interval to check every minute if any tracks need to be disabled
    setInterval(deshabilitarTracksPorHora, 60000); // 60000 ms = 1 minute

    $("#generarTicket").click(function() {
        const fecha = $("#fecha").val();
        if (!fecha) {
            alert("Please select a date.");
            return;
        }
        const tracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        if (!tracks || tracks.length === 0) {
            alert("Please select at least one track.");
            return;
        }

        const tracksUSASeleccionados = tracks.filter(track => Object.keys(horariosCierre.USA).includes(track));
        if (tracks.includes("Venezuela") && tracksUSASeleccionados.length === 0) {
            alert("To play in the 'Venezuela' mode, you must select at least one USA track in addition to 'Venezuela'.");
            return;
        }

        const fechasArray = fecha.split(", ");
        const fechaActual = dayjs().startOf('day');

        for (let fechaSeleccionadaStr of fechasArray) {
            const [monthSel, daySel, yearSel] = fechaSeleccionadaStr.split('-').map(Number);
            const fechaSeleccionada = dayjs(new Date(yearSel, monthSel - 1, daySel));

            if (fechaSeleccionada.isSame(fechaActual, 'day')) {
                const horaActual = dayjs();
                for (let track of tracks) {
                    if (track === 'Venezuela') continue;

                    const horaLimiteStr = obtenerHoraLimite(track);
                    if (horaLimiteStr) {
                        const [horas, minutos] = horaLimiteStr.split(":").map(Number);
                        const cierre = dayjs().hour(horas).minute(minutos).second(0).subtract(10, 'minute');
                        if (horaActual.isAfter(cierre)) {
                            alert(`The track "${track}" has already closed for today. Please select another track or a future date.`);
                            return;
                        }
                    }
                }
            }
        }

        let jugadasValidas = true;
        jugadasData = []; // Reset jugadasData before adding new ones
        const numeroTicket = generarNumeroUnico();

        // Set fechaTransaccion BEFORE building jugadasData to ensure it saves correctly
        fechaTransaccion = dayjs().format('MM/DD/YYYY hh:mm A');

        const tracksTexto = tracks.join(", ");

        $("#tablaJugadas tr").each(function() {
            const numero = $(this).find(".numeroApostado").val();
            const modalidad = $(this).find(".tipoJuego").text();
            if (!numero || (numero.length < 2 || numero.length > 4)) {
                jugadasValidas = false;
                alert("Please enter valid bet numbers (2, 3, or 4 digits).");
                return false;
            }
            if (modalidad === "-") {
                jugadasValidas = false;
                alert("Please select a valid game mode.");
                return false;
            }

            let tracksRequeridos = [];

            if (["Win 4", "Peak 3", "Pulito", "Venezuela"].includes(modalidad)) {
                // Game modes that require USA tracks
                tracksRequeridos = Object.keys(horariosCierre.USA);
            } else if (["RD-Quiniela", "RD-Pale"].includes(modalidad)) {
                // Game modes that require Santo Domingo tracks
                tracksRequeridos = Object.keys(horariosCierre["Santo Domingo"]);
            }

            const tracksSeleccionadosParaModalidad = tracks.filter(track => tracksRequeridos.includes(track));

            if (tracksRequeridos.length > 0 && tracksSeleccionadosParaModalidad.length === 0) {
                jugadasValidas = false;
                alert(`The bet with game mode "${modalidad}" requires at least one corresponding selected track.`);
                return false;
            }

            if (["Venezuela", "Venezuela-Pale", "Pulito", "RD-Quiniela", "RD-Pale"].includes(modalidad)) {
                const straight = parseFloat($(this).find(".straight").val()) || 0;
                if (straight <= 0) {
                    jugadasValidas = false;
                    alert("Please enter at least a bet in Straight.");
                    return false;
                }
                if (modalidad === "Pulito") {
                    const box = parseInt($(this).find(".box").val());
                    if (![1, 2, 3].includes(box)) {
                        jugadasValidas = false;
                        alert("In the Pulito mode, the 'Box' field must be 1, 2, or 3.");
                        return false;
                    }
                }
            } else if (["Win 4", "Peak 3"].includes(modalidad)) {
                const straight = parseFloat($(this).find(".straight").val()) || 0;
                const box = parseFloat($(this).find(".box").val()) || 0;
                const combo = parseFloat($(this).find(".combo").val()) || 0;
                if (straight <= 0 && box <= 0 && combo <= 0) {
                    jugadasValidas = false;
                    alert(`Please enter at least a bet in Straight, Box, or Combo for ${modalidad}.`);
                    return false;
                }
            }

            if (limitesApuesta[modalidad]) {
                if (parseFloat($(this).find(".straight").val()) > (limitesApuesta[modalidad].straight || Infinity)) {
                    jugadasValidas = false;
                    alert(`The amount in Straight exceeds the limit for ${modalidad}.`);
                    return false;
                }
                if (limitesApuesta[modalidad].box !== undefined && modalidad !== "Pulito" && parseFloat($(this).find(".box").val()) > (limitesApuesta[modalidad].box || Infinity)) {
                    jugadasValidas = false;
                    alert(`The amount in Box exceeds the limit for ${modalidad}.`);
                    return false;
                }
                if (limitesApuesta[modalidad].combo !== undefined && parseFloat($(this).find(".combo").val()) > (limitesApuesta[modalidad].combo || Infinity)) {
                    jugadasValidas = false;
                    alert(`The amount in Combo exceeds the limit for ${modalidad}.`);
                    return false;
                }
            }

            const straight = parseFloat($(this).find(".straight").val()) || 0;
            const boxVal = $(this).find(".box").val();
            const box = boxVal !== "" ? boxVal : "-";
            const comboVal = $(this).find(".combo").val();
            const combo = comboVal !== "" ? parseFloat(comboVal) : "-";
            const total = parseFloat($(this).find(".total").text()) || 0;
            const jugadaNumber = generarNumeroUnico();
            const timestamp = new Date().toISOString();

            jugadasData.push({
                "Ticket Number": numeroTicket,
                "Transaction DateTime": fechaTransaccion,
                "Bet Dates": fecha,
                "Tracks": tracksTexto,
                "Bet Number": numero,
                "Game Mode": modalidad,
                "Straight ($)": straight.toFixed(2),
                "Box ($)": box !== "-" ? box : "",
                "Combo ($)": combo !== "-" ? combo.toFixed(2) : "",
                "Total ($)": total.toFixed(2),
                "Jugada Number": jugadaNumber,
                "Timestamp": timestamp
            });
        });

        if (!jugadasValidas) {
            return;
        }

        $("#ticketTracks").text(tracksTexto);
        $("#ticketJugadas").empty();
        $("#tablaJugadas tr").each(function() {
            const num = $(this).find(".numeroApostado").val();
            const modalidad = $(this).find(".tipoJuego").text();
            const straight = parseFloat($(this).find(".straight").val()) || 0;
            const boxVal = $(this).find(".box").val();
            const box = boxVal !== "" ? boxVal : "-";
            const comboVal = $(this).find(".combo").val();
            const combo = comboVal !== "" ? parseFloat(comboVal) : "-";
            const total = parseFloat($(this).find(".total").text()) || 0;
            const fila = ` 
                <tr>
                    <td>${$(this).find("td").first().text()}</td>
                    <td>${num}</td>
                    <td>${modalidad}</td>
                    <td>${straight.toFixed(2)}</td>
                    <td>${box !== "-" ? box : "-"}</td>
                    <td>${combo !== "-" ? combo.toFixed(2) : "-"}</td>
                    <td>${total.toFixed(2)}</td>
                </tr>
            `;
            $("#ticketJugadas").append(fila);
        });
        $("#ticketTotal").text($("#totalJugadas").text());

        // fechaTransaccion already set above
        $("#ticketTransaccion").text(fechaTransaccion);

        $("#numeroTicket").text(numeroTicket);

        $("#qrcode").empty();
        new QRCode(document.getElementById("qrcode"), {
            text: numeroTicket,
            width: 128,
            height: 128,
        });

        $("#ticketFecha").text(fecha);
        console.log("Bet dates assigned to #ticketFecha:", $("#ticketFecha").text());

        ticketModal.show();
    });

    $("#confirmarTicket").click(function() {
        const ticketElement = document.getElementById("preTicket");

        html2canvas(ticketElement).then(canvas => {
            const imgData = canvas.toDataURL("image/png");
            const link = document.createElement('a');
            link.href = imgData;
            link.download = `ticket_${$("#numeroTicket").text()}.png`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            $(this).blur();

            guardarJugadas(jugadasData, function(success) {
                if (success) {
                    window.print();
                    ticketModal.hide();
                    resetForm();
                } else {
                    // No user alert if saving fails
                    window.print();
                    ticketModal.hide();
                    resetForm();
                }
            });

        }).catch(error => {
            console.error("Error capturing the ticket:", error);
            alert("There was a problem generating the ticket. Please try again.");
        });
    });

    function guardarJugadas(jugadasData, callback) {
        console.log("Sending jugadasData to SheetDB:", JSON.stringify(jugadasData));

        $.ajax({
            url: SHEETDB_API_URL,
            method: "POST",
            dataType: "json",
            contentType: "application/json",
            data: JSON.stringify({ data: jugadasData }),
            success: function(response) {
                console.log("Bets stored in SheetDB:", response);
                callback(true);
            },
            error: function(err) {
                console.error("Error sending data to SheetDB:", err);
                callback(false);
            }
        });
    }

    function generarNumeroUnico() {
        return Math.floor(10000000 + Math.random() * 90000000).toString();
    }

    mostrarHorasLimite();
    deshabilitarTracksPorHora();
    setInterval(deshabilitarTracksPorHora, 60000); // Check every minute

});
