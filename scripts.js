 // scripts.js

$(document).ready(function() {

    const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/gect4lbs5bwvr';
    const BACKEND_API_URL = 'https://loteria-backend-j1r3.onrender.com/api';

    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('userRole') || 'user';
    console.log('User Role:', userRole);

    // Inicializar Flatpickr
    flatpickr("#fecha", {
        mode: "multiple",
        dateFormat: "m-d-Y",
        minDate: "today",
        allowInput: true,
        onChange: function(selectedDates, dateStr, instance) {
            selectedDays = selectedDates.length;
            console.log("Días seleccionados:", selectedDays);
            calcularTotal();
            actualizarEstadoTracks();
        },
    });

    let jugadaCount = 0;
    let selectedTracks = 0;
    let selectedDays = 0;
    let totalJugadasGlobal = 0;
    let ticketData = {};
    let ticketId = null;

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
        },
        "Santo Domingo": {
            "Real": "12:45",
            "Gana mas": "14:25",
            "Loteka": "19:30",
            "Nacional": "20:30",
            "Quiniela Pale": "20:30",
            "Primera Día": "11:50",
            "Suerte Día": "12:20",
            "Lotería Real": "12:50",
            "Suerte Tarde": "17:50",
            "Lotedom": "17:50",
            "Primera Noche": "19:50",
            "Panama": "16:00",
            "Quiniela Pale Domingo": "15:30",
            "Nacional Domingo": "17:50"
        },
        // Venezuela no debe tener hora de cierre, asi que no la incluimos en horariosCierre
    };

    const limitesApuesta = {
        "Win 4": { "straight": 6, "box": 30, "combo": 50 },
        "Peak 3": { "straight": 35, "box": 50, "combo": 70 },
        "Venezuela": { "straight": 100 },
        "Venezuela-Pale": { "straight": 20 },
        "Pulito": { "straight": 100 },
        "Pulito-Combinado": { "straight": 100 },
        "RD-Quiniela": { "straight": 100 },
        "RD-Pale": { "straight": 20 },
        "Combo": { "combo": 50 }
    };

    function determinarModalidad(tracks, numero, fila) {
        let modalidad = "-";
        const esUSA = tracks.some(track => Object.keys(horariosCierre.USA).includes(track));
        const esSD = tracks.some(track => Object.keys(horariosCierre["Santo Domingo"]).includes(track));
        const incluyeVenezuela = tracks.includes("Venezuela");

        const longitud = numero.length;
        const boxValue = fila.find(".box").val().trim();
        const acceptableBoxValues = ["1", "2", "3"];
        const acceptableBoxCombinations = ["1,2", "2,3", "1,3", "1,2,3"];

        if (incluyeVenezuela && esUSA) {
            if (longitud === 2) {
                modalidad = "Venezuela";
            } else if (longitud === 4) {
                modalidad = "Venezuela-Pale";
            }
        } else if (esUSA && !esSD) {
            if (longitud === 4) {
                modalidad = "Win 4";
            } else if (longitud === 3) {
                modalidad = "Peak 3";
            } else if (longitud === 2) {
                if (acceptableBoxValues.includes(boxValue)) {
                    modalidad = "Pulito";
                } else if (acceptableBoxCombinations.includes(boxValue)) {
                    modalidad = "Pulito-Combinado";
                }
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

    function agregarJugada() {
        if (jugadaCount >= 100) {
            showAlert("Has alcanzado el máximo de 100 jugadas.", "danger");
            return;
        }
        jugadaCount++;
        const fila = `
            <tr>
                <td>${jugadaCount}</td>
                <td><input type="number" class="form-control numeroApostado" min="0" max="9999" required></td>
                <td class="tipoJuego">-</td>
                <td><input type="number" class="form-control straight" min="0" max="100.00" step="1" placeholder="Ej: 5"></td>
                <td><input type="text" class="form-control box" placeholder="1,2,3"></td>
                <td><input type="number" class="form-control combo" min="0" max="50.00" step="0.10" placeholder="Ej: 3.00"></td>
                <td class="total">0.00</td>
            </tr>
        `;

        $("#tablaJugadas").append(fila);
        agregarListenersNumeroApostado();
        resaltarDuplicados();
        $("#tablaJugadas tr:last .numeroApostado").focus();
    }

    agregarJugada();

    $("#agregarJugada").click(function() {
        agregarJugada();
    });

    $("#eliminarJugada").click(function() {
        if (jugadaCount === 0) {
            showAlert("No hay jugadas para eliminar.", "warning");
            return;
        }
        $("#tablaJugadas tr:last").remove();
        jugadaCount--;
        $("#tablaJugadas tr").each(function(index) {
            $(this).find("td:first").text(index + 1);
        });
        calcularTotal();
    });

    $(".track-checkbox").change(function() {
        const tracksSeleccionados = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        selectedTracks = tracksSeleccionados.filter(track => track !== "Venezuela").length || 1;
        calcularTotal();
    });

    $("#tablaJugadas").on("input", ".numeroApostado, .straight, .box, .combo", function() {
        const fila = $(this).closest("tr");
        const num = fila.find(".numeroApostado").val();
        const tracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        const modalidad = determinarModalidad(tracks, num, fila);
        fila.find(".tipoJuego").text(modalidad);
        actualizarPlaceholders(modalidad, fila);
        calcularTotalJugada(fila);
        calcularTotal();
    });

    function actualizarPlaceholders(modalidad, fila) {
        if (limitesApuesta[modalidad]) {
            fila.find(".straight").attr("placeholder", `Máximo $${limitesApuesta[modalidad].straight}`).prop('disabled', false);
        } else {
            fila.find(".straight").attr("placeholder", "Ej: 5.00").prop('disabled', false);
        }

        if (modalidad === "Pulito" || modalidad === "Pulito-Combinado") {
            fila.find(".box").attr("placeholder", "1,2,3").prop('disabled', false);
            fila.find(".combo").attr("placeholder", "No aplica").prop('disabled', true).val('');
        } else if (modalidad === "Venezuela" || modalidad === "Venezuela-Pale" || modalidad.startsWith("RD-")) {
            fila.find(".box").attr("placeholder", "No aplica").prop('disabled', true).val('');
            fila.find(".combo").attr("placeholder", "No aplica").prop('disabled', true).val('');
        } else if (modalidad === "Win 4" || modalidad === "Peak 3") {
            fila.find(".box").attr("placeholder", `Máximo $${limitesApuesta[modalidad].box}`).prop('disabled', false);
            fila.find(".combo").attr("placeholder", `Máximo $${limitesApuesta[modalidad].combo}`).prop('disabled', false);
        } else if (modalidad === "Combo") {
            fila.find(".straight").attr("placeholder", "No aplica").prop('disabled', true).val('');
            fila.find(".box").attr("placeholder", "No aplica").prop('disabled', true).val('');
            fila.find(".combo").attr("placeholder", `Máximo $${limitesApuesta.Combo.combo}`).prop('disabled', false);
        } else {
            fila.find(".box").attr("placeholder", "Ej: 2.50").prop('disabled', false);
            fila.find(".combo").attr("placeholder", "Ej: 3.00").prop('disabled', false);
        }
    }

    function calcularTotalJugada(fila) {
        const modalidad = fila.find(".tipoJuego").text();
        const numero = fila.find(".numeroApostado").val();
        if (!numero || numero.length < 2 || numero.length > 4) {
            fila.find(".total").text("0.00");
            return;
        }

        const combinaciones = calcularCombinaciones(numero);
        let straight = parseFloat(fila.find(".straight").val()) || 0;
        let boxVal = fila.find(".box").val().trim();
        let box = parseFloat(boxVal) || 0;
        let combo = parseFloat(fila.find(".combo").val()) || 0;

        if (limitesApuesta[modalidad]) {
            straight = Math.min(straight, limitesApuesta[modalidad].straight || straight);
            if (limitesApuesta[modalidad].box !== undefined && modalidad !== "Pulito" && modalidad !== "Pulito-Combinado") {
                box = Math.min(box, limitesApuesta[modalidad].box || box);
            }
            if (limitesApuesta[modalidad].combo !== undefined) {
                combo = Math.min(combo, limitesApuesta[modalidad].combo || combo);
            }
        }

        let total = 0;
        if (modalidad === "Pulito" || modalidad === "Pulito-Combinado") {
            const boxValues = boxVal.split(",").filter(value => value !== "");
            const countBoxValues = boxValues.length;
            total = straight * countBoxValues;
        } else if (modalidad === "Venezuela" || modalidad.startsWith("RD-")) {
            total = straight;
        } else if (modalidad === "Win 4" || modalidad === "Peak 3") {
            total = straight + box + (combo * combinaciones);
        } else if (modalidad === "Combo") {
            total = combo;
        } else {
            total = straight + box + combo;
        }

        fila.find(".total").text(total.toFixed(2));
    }

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

    function calcularTotal() {
        let total = 0;
        $(".total").each(function() {
            total += parseFloat($(this).text()) || 0;
        });
        console.log("Total de jugadas antes de multiplicar:", total);
        console.log("Tracks seleccionados:", selectedTracks);
        console.log("Días seleccionados:", selectedDays);

        if (selectedDays === 0) {
            total = 0;
        } else {
            total = (total * selectedTracks * selectedDays).toFixed(2);
        }
        console.log("Total después de multiplicar:", total);
        $("#totalJugadas").text(total);
    }

    var ticketModal = new bootstrap.Modal(document.getElementById('ticketModal'));

    function showAlert(message, type) {
        const alertHTML = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
            </div>
        `;
        $("#ticketAlerts").append(alertHTML);
    }

    function generarNumeroUnico() {
        return Math.floor(10000000 + Math.random() * 90000000).toString();
    }

    $("#generarTicket").click(function() {
        $("#ticketAlerts").empty();

        const fechaStr = $("#fecha").val();
        console.log("Valor de fecha:", fechaStr);
        if (!fechaStr) {
            showAlert("Por favor, selecciona una fecha.", "warning");
            return;
        }

        const fechasProcesadas = fechaStr.split(", ");

        const tracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        if (!tracks || tracks.length === 0) {
            showAlert("Por favor, selecciona al menos un track.", "warning");
            return;
        }

        const tracksUSASeleccionados = tracks.filter(track => Object.keys(horariosCierre.USA).includes(track));
        if (tracks.includes("Venezuela") && tracksUSASeleccionados.length === 0) {
            showAlert("Para jugar en la modalidad 'Venezuela', debes seleccionar al menos un track de USA además de 'Venezuela'.", "warning");
            return;
        }

        const fechasValidacion = fechasProcesadas;
        const fechaActual = new Date();
        const yearActual = fechaActual.getFullYear();
        const monthActual = fechaActual.getMonth();
        const dayActual = fechaActual.getDate();
        const fechaActualSinHora = new Date(yearActual, monthActual, dayActual);

        for (let fechaSeleccionadaStr of fechasValidacion) {
            const [monthSel, daySel, yearSel] = fechaSeleccionadaStr.split('-').map(Number);
            const fechaSeleccionada = new Date(yearSel, monthSel - 1, daySel);

            if (fechaSeleccionada.getTime() === fechaActualSinHora.getTime()) {
                const horaActual = new Date();
                for (let track of tracks) {
                    if (track === 'Venezuela') continue; // Venezuela siempre disponible

                    const horaLimiteStr = obtenerHoraLimite(track);
                    if (horaLimiteStr) {
                        const [horas, minutos] = horaLimiteStr.split(":");
                        const horaLimite = new Date();
                        // Ahora validamos 10 minutos antes del cierre
                        horaLimite.setHours(parseInt(horas), parseInt(minutos) - 10, 0, 0);
                        if (horaActual > horaLimite) {
                            showAlert(`El track "${track}" ya ha cerrado para hoy. Por favor, selecciona otro track o fecha.`, "danger");
                            return;
                        }
                    }
                }
            }
        }

        let jugadasValidas = true;
        const jugadasArray = [];
        $("#tablaJugadas tr").each(function() {
            const numero = $(this).find(".numeroApostado").val();
            const modalidad = $(this).find(".tipoJuego").text();
            if (!numero || (numero.length < 2 || numero.length > 4)) {
                jugadasValidas = false;
                showAlert("Por favor, ingresa números apostados válidos (2, 3 o 4 dígitos).", "danger");
                return false;
            }
            if (modalidad === "-") {
                jugadasValidas = false;
                showAlert("Por favor, selecciona una modalidad de juego válida.", "danger");
                return false;
            }

            let tracksRequeridos = [];
            if (["Win 4", "Peak 3", "Pulito", "Pulito-Combinado", "Venezuela"].includes(modalidad)) {
                tracksRequeridos = Object.keys(horariosCierre.USA);
            } else if (["RD-Quiniela", "RD-Pale"].includes(modalidad)) {
                tracksRequeridos = Object.keys(horariosCierre["Santo Domingo"]);
            }

            const tracksSeleccionadosParaModalidad = tracks.filter(track => tracksRequeridos.includes(track));

            if (tracksRequeridos.length > 0 && tracksSeleccionadosParaModalidad.length === 0) {
                jugadasValidas = false;
                showAlert(`La jugada con modalidad "${modalidad}" requiere al menos un track seleccionado correspondiente.`, "danger");
                return false;
            }

            if (["Venezuela", "Venezuela-Pale", "Pulito", "Pulito-Combinado", "RD-Quiniela", "RD-Pale"].includes(modalidad)) {
                const straight = parseFloat($(this).find(".straight").val()) || 0;
                if (straight <= 0) {
                    jugadasValidas = false;
                    showAlert("Por favor, ingresa al menos una apuesta en Straight.", "danger");
                    return false;
                }
                if (modalidad === "Pulito" || modalidad === "Pulito-Combinado") {
                    const box = $(this).find(".box").val().trim();
                    const acceptableBoxValues = ["1", "2", "3"];
                    const acceptableBoxCombinations = ["1,2", "2,3", "1,3", "1,2,3"];
                    const allAcceptableValues = acceptableBoxValues.concat(acceptableBoxCombinations);
                    if (!allAcceptableValues.includes(box)) {
                        jugadasValidas = false;
                        showAlert("En la modalidad Pulito o Pulito-Combinado, el campo 'Box' debe ser 1, 2, 3, 1,2, 2,3, 1,3 o 1,2,3.", "danger");
                        return false;
                    }
                }
            } else if (["Win 4", "Peak 3"].includes(modalidad)) {
                const straight = parseFloat($(this).find(".straight").val()) || 0;
                const boxVal = $(this).find(".box").val();
                const box = boxVal !== "" ? parseFloat(boxVal) : 0;
                const combo = parseFloat($(this).find(".combo").val()) || 0;
                if (straight <= 0 && box <= 0 && combo <= 0) {
                    jugadasValidas = false;
                    showAlert(`Por favor, ingresa al menos una apuesta en Straight, Box o Combo para ${modalidad}.`, "danger");
                    return false;
                }
            }

            const straight = parseFloat($(this).find(".straight").val()) || 0;
            const boxVal = $(this).find(".box").val();
            const box = boxVal !== "" ? boxVal : "-";
            const comboVal = $(this).find(".combo").val();
            const combo = comboVal !== "" ? parseFloat(comboVal) : "-";
            const total = parseFloat($(this).find(".total").text()) || 0;
            if (limitesApuesta[modalidad]) {
                if (straight > (limitesApuesta[modalidad].straight || Infinity)) {
                    jugadasValidas = false;
                    showAlert(`El monto en Straight excede el límite para ${modalidad}.`, "danger");
                    return false;
                }
                if (limitesApuesta[modalidad].box !== undefined && modalidad !== "Pulito" && modalidad !== "Pulito-Combinado" && parseFloat(boxVal) > (limitesApuesta[modalidad].box || Infinity)) {
                    jugadasValidas = false;
                    showAlert(`El monto en Box excede el límite para ${modalidad}.`, "danger");
                    return false;
                }
                if (limitesApuesta[modalidad].combo !== undefined && combo !== "-" && combo > (limitesApuesta[modalidad].combo || Infinity)) {
                    jugadasValidas = false;
                    showAlert(`El monto en Combo excede el límite para ${modalidad}.`, "danger");
                    return false;
                }
            }

            jugadasArray.push({
                numero: numero,
                modalidad: modalidad,
                straight: straight,
                box: box,
                combo: combo,
                total: total
            });
        });

        if (!jugadasValidas) {
            return;
        }

        const tracksTexto = tracks.join(", ");
        $("#ticketTracks").text(tracksTexto);
        $("#ticketJugadas").empty();
        jugadasArray.forEach((jugada, index) => {
            const fila = ` 
                <tr>
                    <td>${index + 1}</td>
                    <td>${jugada.numero}</td>
                    <td>${jugada.modalidad}</td>
                    <td>${jugada.straight.toFixed(2)}</td>
                    <td>${jugada.box !== "-" ? jugada.box : "-"}</td>
                    <td>${jugada.combo !== "-" ? jugada.combo.toFixed(2) : "-"}</td>
                    <td>${jugada.total.toFixed(2)}</td>
                </tr>
            `;
            $("#ticketJugadas").append(fila);
        });

        $("#ticketTotal").text($("#totalJugadas").text());
        $("#ticketFecha").text(fechaStr);
        console.log("Fechas asignadas a #ticketFecha:", $("#ticketFecha").text());

        totalJugadasGlobal = parseFloat($("#totalJugadas").text());

        const fechasProcesadas2 = fechaStr.split(", ");

        ticketData = {
            fecha: fechasProcesadas2,
            tracks: tracks,
            jugadas: jugadasArray,
            totalAmount: totalJugadasGlobal,
            ticketJugadasHTML: $("#ticketJugadas").html(),
            ticketTracks: tracksTexto,
            ticketFecha: fechaStr,
            selectedDays: selectedDays,
            selectedTracks: selectedTracks
        };

        $.ajax({
            url: `${BACKEND_API_URL}/tickets/store-ticket`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            dataType: 'json',
            contentType: 'application/json',
            data: JSON.stringify(ticketData),
            success: function(response) {
                if (response.ticketId) {
                    ticketId = response.ticketId;
                    localStorage.setItem('ticketId', ticketId);
                    $("#numeroTicket").text('');
                    $("#ticketTransaccion").text('');
                    $("#qrcode").empty();
                    ticketModal.show();

                    if (userRole === 'user') {
                        $('#confirmarPagoFormContainer').show();
                        $('#confirmarTicketContainer').hide();
                    } else {
                        $('#confirmarPagoFormContainer').hide();
                        $('#confirmarTicketContainer').show();
                        $('#confirmarTicket').show();
                    }
                } else {
                    showAlert('Error al almacenar los datos del ticket. Por favor, inténtalo de nuevo.', 'danger');
                }
            },
            error: function(error) {
                console.error('Error al almacenar los datos del ticket:', error);
                const errorMsg = error.responseJSON && error.responseJSON.error ? error.responseJSON.error : 'Error al almacenar los datos del ticket. Por favor, inténtalo de nuevo.';
                showAlert(errorMsg, 'danger');
            }
        });
    });

    $("#confirmarPagoForm").submit(function(event) {
        event.preventDefault();
        $("#ticketAlerts").empty();

        const codigoTransaccion = $("#codigoTransaccion").val().trim();
        const archivoComprobante = $("#comprobantePago")[0].files[0];

        if (!codigoTransaccion) {
            showAlert("Por favor, ingresa el código de transacción.", "warning");
            return;
        }

        if (archivoComprobante) {
            const tiposPermitidos = ['image/jpeg', 'image/png', 'image/jpg'];
            if (!tiposPermitidos.includes(archivoComprobante.type)) {
                showAlert("El comprobante debe ser una imagen en formato JPG o PNG.", "danger");
                return;
            }
        }

        const formData = new FormData();
        formData.append('ticketId', ticketId);
        formData.append('codigoTransaccion', codigoTransaccion);
        if (archivoComprobante) {
            formData.append('comprobantePago', archivoComprobante);
        }

        $.ajax({
            url: `${BACKEND_API_URL}/tickets/confirmar-pago-manual`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            data: formData,
            processData: false,
            contentType: false,
            success: function(response) {
                if (response.success) {
                    showAlert("Pago confirmado exitosamente.", "success");
                    confirmarYGuardarTicket('Pago Manual');
                } else {
                    showAlert(`Error al confirmar el pago: ${response.error}`, "danger");
                }
            },
            error: function(error) {
                console.error('Error al confirmar el pago manual:', error);
                const errorMsg = error.responseJSON && error.responseJSON.error ? error.responseJSON.error : 'Error al confirmar el pago. Por favor, inténtalo de nuevo.';
                showAlert(errorMsg, 'danger');
            }
        });
    });

    $("#comprobantePago").change(function(event) {
        const archivo = event.target.files[0];
        if (archivo) {
            const lector = new FileReader();
            lector.onload = function(e) {
                $("#previsualizacionComprobante").html(`<img src="${e.target.result}" alt="Comprobante de Pago">`);
            }
            lector.readAsDataURL(archivo);
        } else {
            $("#previsualizacionComprobante").empty();
        }
    });

    $("#confirmarTicket").click(function() {
        $("#ticketAlerts").empty();

        if (userRole === 'user') {
            showAlert("Por favor, confirma tu pago antes de generar el ticket.", "warning");
        } else {
            confirmarYGuardarTicket('Efectivo');
        }
    });

    function confirmarYGuardarTicket(metodoPago) {
        $.ajax({
            url: `${BACKEND_API_URL}/tickets/validate-ticket`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            dataType: 'json',
            contentType: 'application/json',
            data: JSON.stringify({ ticketId: ticketId, userRole: userRole }),
            success: function(response) {
                console.log('Validación del ticket:', response);
                console.log('User Role dentro de confirmarYGuardarTicket:', userRole);
                if (response.valid || userRole !== 'user') {
                    const numeroTicket = generarNumeroUnico();
                    $("#numeroTicket").text(numeroTicket);
                    const fechaTransaccion = dayjs().format('MM-DD-YYYY hh:mm A');
                    $("#ticketTransaccion").text(fechaTransaccion);

                    $("#qrcode").empty();
                    new QRCode(document.getElementById("qrcode"), {
                        text: numeroTicket,
                        width: 128,
                        height: 128,
                    });

                    const ticketNumber = numeroTicket;
                    const transactionDateTime = fechaTransaccion;
                    const betDates = ticketData.ticketFecha;
                    const tracks = ticketData.ticketTracks;
                    const totalTicket = ticketData.totalAmount.toFixed(2);
                    const timestamp = new Date().toISOString();

                    const jugadasData = [];
                    ticketData.jugadas.forEach(function(jugada) {
                        const jugadaNumber = generarNumeroUnico();
                        const jugadaData = {
                            "Ticket Number": ticketNumber,
                            "Transaction DateTime": transactionDateTime,
                            "Bet Dates": betDates,
                            "Tracks": tracks,
                            "Bet Number": jugada.numero,
                            "Game Mode": jugada.modalidad,
                            "Straight ($)": jugada.straight,
                            "Box ($)": jugada.box !== "-" ? parseFloat(jugada.box) : null,
                            "Combo ($)": jugada.combo !== "-" ? parseFloat(jugada.combo) : null,
                            "Total ($)": jugada.total,
                            "Payment Method": metodoPago,
                            "Jugada Number": jugadaNumber,
                            "Timestamp": timestamp
                        };
                        jugadasData.push(jugadaData);
                    });

                    enviarFormulario(jugadasData);
                } else {
                    showAlert('El pago no ha sido completado o el ticket no es válido.', 'danger');
                }
            },
            error: function(error) {
                console.error('Error al validar el ticket en el servidor:', error);
                showAlert('Error al validar el ticket. Por favor, inténtalo de nuevo.', 'danger');
            }
        });
    }

    function enviarFormulario(datos) {
        const sheetDBRequest = $.ajax({
            url: SHEETDB_API_URL,
            method: "POST",
            dataType: "json",
            contentType: "application/json",
            data: JSON.stringify(datos)
        });

        const backendRequest = $.ajax({
            url: `${BACKEND_API_URL}/jugadas/save-jugadas`,
            method: "POST",
            headers: {
                'Authorization': `Bearer ${token}`
            },
            dataType: "json",
            contentType: "application/json",
            data: JSON.stringify(datos)
        });

        $.when(sheetDBRequest, backendRequest).done(function(sheetDBResponse, backendResponse) {
            console.log("Datos enviados a ambos destinos:");
            console.log("SheetDB:", sheetDBResponse);
            console.log("Backend:", backendResponse);

            showAlert("Ticket guardado y enviado exitosamente.", "success");

            window.print();

            html2canvas(document.querySelector("#preTicket")).then(canvas => {
                const imgData = canvas.toDataURL("image/png");
                const link = document.createElement('a');
                link.href = imgData;
                link.download = 'ticket.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });

            ticketModal.hide();
            resetForm();
            ticketData = {};
            ticketId = null;
            localStorage.removeItem('ticketId');
            const newURL = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, newURL);

        }).fail(function(jqXHR, textStatus, errorThrown) {
            console.error("Error al enviar datos:", textStatus, errorThrown);
            let errorMsg = "Hubo un problema al enviar los datos. Por favor, inténtalo de nuevo.";
            if (jqXHR.responseJSON && jqXHR.responseJSON.error) {
                errorMsg = jqXHR.responseJSON.error;
            }
            showAlert(errorMsg, "danger");
        });
    }

    $("#resetForm").click(function() { resetForm(); });

    function resetForm() {
        $("#lotteryForm")[0].reset();
        $("#tablaJugadas").empty();
        jugadaCount = 0;
        selectedTracks = 0;
        selectedDays = 0;
        agregarJugada();
        $("#totalJugadas").text("0.00");
        $("#tablaJugadas tr").each(function() {
            actualizarPlaceholders("-", $(this));
        });
        resaltarDuplicados();
        ticketData = {};
        ticketId = null;
        localStorage.removeItem('ticketId');
        $("#ticketAlerts").empty();
        $(".track-checkbox").prop('disabled', false).closest('label').removeClass('closed-track');
    }

    // Ahora actualizamos el estado de los tracks para deshabilitarlos 10 minutos antes del cierre
    function actualizarEstadoTracks() {
        const fechaVal = $("#fecha").val();
        if (!fechaVal) return;
        const fechaSeleccionadaStr = fechaVal.split(", ")[0];
        if (!fechaSeleccionadaStr) return;

        const [monthSel, daySel, yearSel] = fechaSeleccionadaStr.split('-').map(Number);
        const fechaSeleccionada = new Date(yearSel, monthSel - 1, daySel);

        const fechaActual = new Date();
        const esMismoDia = fechaSeleccionada.toDateString() === fechaActual.toDateString();

        if (!esMismoDia) {
            $(".track-checkbox").prop('disabled', false).closest('label').removeClass('closed-track');
            return;
        }

        const ahora = new Date();
        const ahoraMiliseconds = ahora.getHours() * 60 + ahora.getMinutes();

        // Recorremos los horarios de cierre
        for (let region in horariosCierre) {
            for (let track in horariosCierre[region]) {
                // Si es Venezuela, siempre habilitado
                if (track === 'Venezuela') {
                    $(`.track-checkbox[value="${track}"]`).prop('disabled', false).closest('label').removeClass('closed-track');
                    continue;
                }

                const horaCierreStr = horariosCierre[region][track];
                const [horaCierre, minutoCierre] = horaCierreStr.split(":").map(Number);
                const horaCierreMiliseconds = horaCierre * 60 + minutoCierre;

                // Restamos 10 minutos a la hora de cierre
                const horaCierreConAnticipo = horaCierreMiliseconds - 10;

                // Si la hora actual es mayor o igual a la hora de cierre anticipada, deshabilitamos
                if (ahoraMiliseconds >= horaCierreConAnticipo) {
                    $(`.track-checkbox[value="${track}"]`).prop('disabled', true).prop('checked', false).closest('label').addClass('closed-track');
                } else {
                    $(`.track-checkbox[value="${track}"]`).prop('disabled', false).closest('label').removeClass('closed-track');
                }
            }
        }
    }

    $("#fecha").change(function() { actualizarEstadoTracks(); });

    setInterval(function() {
        const fechaVal = $("#fecha").val();
        if (!fechaVal) return;
        const fechaSeleccionadaStr = fechaVal.split(", ")[0];
        if (!fechaSeleccionadaStr) return;

        const [monthSel, daySel, yearSel] = fechaSeleccionadaStr.split('-').map(Number);
        const fechaSeleccionada = new Date(yearSel, monthSel - 1, daySel);

        const fechaActual = new Date();
        const esMismoDia = fechaSeleccionada.toDateString() === fechaActual.toDateString();

        if (esMismoDia) {
            actualizarEstadoTracks();
        }
    }, 60000);

    function mostrarHorasLimite() {
        $(".cutoff-time").each(function() {
            const track = $(this).data("track");
            if (track === 'Venezuela') {
                $(this).text(`Disponible siempre`);
                return;
            }
            let cierreStr = "";
            if (horariosCierre.USA[track]) cierreStr = horariosCierre.USA[track];
            else if (horariosCierre["Santo Domingo"][track]) cierreStr = horariosCierre["Santo Domingo"][track];

            if (cierreStr) {
                const cierre = new Date(`1970-01-01T${cierreStr}:00`);
                // Restamos 10 minutos para mostrar la hora límite
                cierre.setMinutes(cierre.getMinutes() - 10);
                const horas = cierre.getHours().toString().padStart(2, '0');
                const minutos = cierre.getMinutes().toString().padStart(2, '0');
                const horaLimite = `${horas}:${minutos}`;
                $(this).text(`Hora límite: ${horaLimite}`);
            } else {
                // Si no hay hora de cierre, caso Venezuela
                $(this).text(`Disponible siempre`);
            }
        });
    }

    function obtenerHoraLimite(track) {
        for (let region in horariosCierre) {
            if (horariosCierre[region][track]) {
                return horariosCierre[region][track];
            }
        }
        return null;
    }

    function resaltarDuplicados() {
        const camposNumeros = document.querySelectorAll('.numeroApostado');
        const valores = {};
        const duplicados = new Set();

        camposNumeros.forEach(campo => {
            const valor = campo.value.trim();
            if (valor) {
                if (valores[valor]) duplicados.add(valor);
                else valores[valor] = true;
            }
        });

        camposNumeros.forEach(campo => {
            if (duplicados.has(campo.value.trim())) campo.classList.add('duplicado');
            else campo.classList.remove('duplicado');
        });
    }

    function agregarListenersNumeroApostado() {
        const camposNumeros = document.querySelectorAll('.numeroApostado');
        camposNumeros.forEach(campo => {
            campo.removeEventListener('input', resaltarDuplicados);
            campo.addEventListener('input', resaltarDuplicados);
        });
    }

    agregarListenersNumeroApostado();
    resaltarDuplicados();
    mostrarHorasLimite();

});
