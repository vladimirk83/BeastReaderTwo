 // scripts.js

let fechaTransaccion = '';

$(document).ready(function() {

    // Define las URLs de tu API de SheetDB para tickets y jugadas
    const SHEETDB_API_URL_TICKETS = 'https://sheetdb.io/api/v1/gect4lbs5bwvr/tickets'; // Reemplaza con tu URL real para tickets
    const SHEETDB_API_URL_JUGADAS = 'https://sheetdb.io/api/v1/gect4lbs5bwvr/jugadas'; // Reemplaza con tu URL real para jugadas

    // Inicializar Flatpickr con selección de múltiples fechas
    flatpickr("#fecha", {
        mode: "multiple",
        dateFormat: "m-d-Y", // Formato MM-DD-YYYY
        minDate: "today",
        allowInput: true,
        onChange: function(selectedDates, dateStr, instance) {
            selectedDays = selectedDates.length;
            console.log("Días seleccionados:", selectedDays);
            calcularTotal();
            actualizarEstadoTracks(); // Actualizar estado de tracks cada vez que cambie la fecha
        },
    });

    let jugadaCount = 0;
    let selectedTracks = 0;
    let selectedDays = 0;
    let totalJugadasGlobal = 0;

    // Horarios de cierre por track (excluyendo "Venezuela")
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
        }
        // "Venezuela" no se incluye aquí para que siempre esté disponible
    };

    // Límites de apuestas por modalidad
    const limitesApuesta = {
        "Win 4": { "straight": 6, "box": 30, "combo": 50 },
        "Peak 3": { "straight": 35, "box": 50, "combo": 70 },
        "Venezuela": { "straight": 100 },
        "Venezuela-Pale": { "straight": 100 },
        "Pulito": { "straight": 100 },
        "Pulito-Combinado": { "straight": 100 },
        "RD-Quiniela": { "straight": 100 },
        "RD-Pale": { "straight": 20 },
        "Combo": { "combo": 50 }
    };

    /**
     * Determina la modalidad de juego basada en los tracks seleccionados y el número apostado.
     * @param {Array} tracks - Array de tracks seleccionados.
     * @param {String} numero - Número apostado.
     * @param {jQuery} fila - Fila de la jugada.
     * @returns {String} - Modalidad de juego.
     */
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

    /**
     * Agrega una nueva jugada a la tabla.
     */
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

    // Agregar una jugada inicial
    agregarJugada();

    /**
     * Muestra una alerta en la interfaz.
     * @param {String} message - Mensaje de la alerta.
     * @param {String} type - Tipo de alerta (e.g., 'success', 'danger', 'warning').
     */
    function showAlert(message, type) {
        const alertHTML = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
            </div>
        `;
        $("#ticketAlerts").append(alertHTML);
    }

    /**
     * Calcula el total de todas las jugadas considerando los tracks y días seleccionados.
     */
    function calcularTotal() {
        let total = 0;
        $(".total").each(function() {
            total += parseFloat($(this).text()) || 0;
        });

        // Si no hay días seleccionados, el total es 0
        if (selectedDays === 0) {
            total = 0;
        } else {
            // Multiplicar por el número de tracks seleccionados y días
            total = (total * selectedTracks * selectedDays).toFixed(2);
        }

        $("#totalJugadas").text(total);
    }

    /**
     * Calcula el total de una jugada específica.
     * @param {jQuery} fila - Fila de la jugada.
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
        let boxVal = fila.find(".box").val().trim();
        let box = parseFloat(boxVal) || 0;
        let combo = parseFloat(fila.find(".combo").val()) || 0;

        // Aplicar límites según modalidad
        if (limitesApuesta[modalidad]) {
            straight = Math.min(straight, limitesApuesta[modalidad].straight || straight);
            if (limitesApuesta[modalidad].box !== undefined && modalidad !== "Pulito" && modalidad !== "Pulito-Combinado") {
                box = Math.min(box, limitesApuesta[modalidad].box || box);
            }
            if (limitesApuesta[modalidad].combo !== undefined) {
                combo = Math.min(combo, limitesApuesta[modalidad].combo || combo);
            }
        }

        // Calcular total según modalidad
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

    /**
     * Calcula el número de combinaciones posibles para un número dado.
     * @param {String} numero - Número apostado.
     * @returns {Number} - Número de combinaciones.
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
     * Evento delegado para detectar cambios en los campos de entrada de jugadas.
     * Utiliza event delegation para manejar dinámicamente las filas agregadas.
     */
    $("#tablaJugadas").on("input", ".numeroApostado, .straight, .box, .combo", function() {
        const fila = $(this).closest("tr");
        const num = fila.find(".numeroApostado").val();
        const tracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        const modalidad = determinarModalidad(tracks, num, fila);
        fila.find(".tipoJuego").text(modalidad);
        actualizarPlaceholders(modalidad, fila);
        calcularTotalJugada(fila);
        calcularTotal();
        resaltarDuplicados();
    });

    /**
     * Actualiza los placeholders y el estado de los campos según la modalidad de juego.
     * @param {String} modalidad - Modalidad de juego.
     * @param {jQuery} fila - Fila de la jugada.
     */
    function actualizarPlaceholders(modalidad, fila) {
        if (limitesApuesta[modalidad]) {
            fila.find(".straight").attr("placeholder", `Máximo $${limitesApuesta[modalidad].straight}`).prop('disabled', false);
        } else {
            fila.find(".straight").attr("placeholder", "Ej: 5.00").prop('disabled', false);
        }

        if (modalidad === "Pulito" || modalidad === "Pulito-Combinado") {
            fila.find(".box").attr("placeholder", "1,2,3").prop('disabled', false);
            fila.find(".combo").attr("placeholder", "No aplica").prop('disabled', true).val('');
        } else if (modalidad === "Venezuela" || modalidad.startsWith("RD-")) {
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
            // Modalidad no reconocida
            fila.find(".box").attr("placeholder", "Ej: 2.50").prop('disabled', false);
            fila.find(".combo").attr("placeholder", "Ej: 3.00").prop('disabled', false);
        }
    }

    /**
     * Resalta los números apostados duplicados.
     */
    function resaltarDuplicados() {
        const camposNumeros = $('.numeroApostado');
        const valores = {};
        const duplicados = new Set();

        // Recopilar valores y detectar duplicados
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

        // Aplicar o remover la clase .duplicado
        camposNumeros.each(function() {
            if (duplicados.has($(this).val().trim())) {
                $(this).addClass('duplicado');
            } else {
                $(this).removeClass('duplicado');
            }
        });
    }

    /**
     * Agrega listeners para resaltar duplicados en los campos de número apostado.
     */
    function agregarListenersNumeroApostado() {
        const camposNumeros = document.querySelectorAll('.numeroApostado');
        camposNumeros.forEach(campo => {
            campo.removeEventListener('input', resaltarDuplicados);
            campo.addEventListener('input', resaltarDuplicados);
        });
    }

    // Agregar listeners y resaltar duplicados al cargar la página
    agregarListenersNumeroApostado();
    resaltarDuplicados();

    /**
     * Reinicia el formulario a su estado inicial.
     */
    function resetForm() {
        $("#lotteryForm")[0].reset();
        $("#tablaJugadas").empty();
        jugadaCount = 0;
        selectedTracks = 0;
        selectedDays = 0;
        agregarJugada();
        $("#totalJugadas").text("0.00");
        resaltarDuplicados();
        mostrarHorasLimite();
        $("#ticketAlerts").empty();
        $(".track-checkbox").prop('disabled', false).closest('label').removeClass('closed-track');
    }

    // Inicializar Bootstrap Modal
    var ticketModal = new bootstrap.Modal(document.getElementById('ticketModal'));

    /**
     * Genera un número único de 8 dígitos.
     * @returns {String} - Número único.
     */
    function generarNumeroUnico() {
        return Math.floor(10000000 + Math.random() * 90000000).toString();
    }

    /**
     * Obtiene la hora límite de cierre para un track específico.
     * @param {String} track - Nombre del track.
     * @returns {String|null} - Hora límite en formato "HH:MM" o null si no se encuentra.
     */
    function obtenerHoraLimite(track) {
        for (let region in horariosCierre) {
            if (horariosCierre[region][track]) {
                return horariosCierre[region][track];
            }
        }
        return null;
    }

    /**
     * Muestra las horas límite para cada track en la interfaz.
     */
    function mostrarHorasLimite() {
        $(".cutoff-time").each(function() {
            const track = $(this).data("track");

            if (track === 'Venezuela') {
               $(this).text(`Disponible siempre`);
               return;
            }
            let cierreStr = "";
            if (horariosCierre.USA[track]) {
                cierreStr = horariosCierre.USA[track];
            }
            else if (horariosCierre["Santo Domingo"][track]) {
                cierreStr = horariosCierre["Santo Domingo"][track];
            }

            if (cierreStr) {
                // Usar backticks para crear una cadena de texto correcta
                const cierre = new Date(`1970-01-01T${cierreStr}:00`);
                cierre.setMinutes(cierre.getMinutes() - 10); // Restar 10 minutos
                const horas = cierre.getHours().toString().padStart(2, '0');
                const minutos = cierre.getMinutes().toString().padStart(2, '0');
                const horaLimite = `${horas}:${minutos}`;
                $(this).text(`Hora límite: ${horaLimite}`);
            }
        });
    }

    /**
     * Actualiza el estado de los tracks, deshabilitándolos 10 minutos antes de la hora de cierre.
     */
    function actualizarEstadoTracks() {
        const fechaVal = $("#fecha").val();
        if (!fechaVal) return;
        const fechaSeleccionadaStr = fechaVal.split(", ")[0];
        if (!fechaSeleccionadaStr) return;

        const [monthSel, daySel, yearSel] = fechaSeleccionadaStr.split('-').map(Number);
        const fechaSeleccionada = new Date(yearSel, monthSel - 1, daySel);

        const fechaActual = new Date();
        const esMismoDia = fechaSeleccionada.toDateString() === fechaActual.toDateString();

        // Si no es el mismo día, habilitar todos los tracks
        if (!esMismoDia) {
            $(".track-checkbox").prop('disabled', false).closest('label').removeClass('closed-track');
            return;
        }

        const ahora = new Date();
        const ahoraMinutos = ahora.getHours() * 60 + ahora.getMinutes();

        for (let region in horariosCierre) {
            for (let track in horariosCierre[region]) {
                // "Venezuela" nunca se deshabilita
                if (track === 'Venezuela') {
                    $(`.track-checkbox[value="${track}"]`).prop('disabled', false).closest('label').removeClass('closed-track');
                    continue;
                }

                const horaCierreStr = horariosCierre[region][track];
                const [horaCierre, minutoCierre] = horaCierreStr.split(":").map(Number);
                const horaCierreMinutos = horaCierre * 60 + minutoCierre;

                // 10 minutos antes del cierre
                const horaLimite = horaCierreMinutos - 10;

                if (ahoraMinutos >= horaLimite) {
                    $(`.track-checkbox[value="${track}"]`)
                        .prop('disabled', true)
                        .prop('checked', false)
                        .closest('label').addClass('closed-track');
                } else {
                    $(`.track-checkbox[value="${track}"]`)
                        .prop('disabled', false)
                        .closest('label').removeClass('closed-track');
                }
            }
        }
    }

    /**
     * Evento para generar el ticket después de validar el formulario.
     */
    $("#generarTicket").click(function() {
        $("#ticketAlerts").empty();

        // Validar formulario
        const fecha = $("#fecha").val();
        if (!fecha) {
            showAlert("Por favor, selecciona una fecha.", "warning");
            return;
        }
        const tracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        if (!tracks || tracks.length === 0) {
            showAlert("Por favor, selecciona al menos un track.", "warning");
            return;
        }

        // Validar que si se seleccionó el track "Venezuela", se haya seleccionado al menos un track de USA
        const tracksUSASeleccionados = tracks.filter(track => Object.keys(horariosCierre.USA).includes(track));
        if (tracks.includes("Venezuela") && tracksUSASeleccionados.length === 0) {
            showAlert("Para jugar en la modalidad 'Venezuela', debes seleccionar al menos un track de USA además de 'Venezuela'.", "warning");
            return;
        }

        // Obtener las fechas seleccionadas como array
        const fechasArray = fecha.split(", ");
        const fechaActual = new Date();
        const yearActual = fechaActual.getFullYear();
        const monthActual = fechaActual.getMonth();
        const dayActual = fechaActual.getDate();
        const fechaActualSinHora = new Date(yearActual, monthActual, dayActual);

        // Validar cada fecha seleccionada
        for (let fechaSeleccionadaStr of fechasArray) {
            // Extraer los componentes de la fecha seleccionada
            const [monthSel, daySel, yearSel] = fechaSeleccionadaStr.split('-').map(Number);
            const fechaSeleccionada = new Date(yearSel, monthSel - 1, daySel);

            if (fechaSeleccionada.getTime() === fechaActualSinHora.getTime()) {
                // La fecha seleccionada es hoy, aplicar validación de hora
                const horaActual = new Date();
                for (let track of tracks) {
                    if (track === 'Venezuela') continue; // Excluir "Venezuela" de la validación de hora

                    const horaLimiteStr = obtenerHoraLimite(track);
                    if (horaLimiteStr) {
                        const [horas, minutos] = horaLimiteStr.split(":").map(Number);
                        // Ajustar la validación a 10 minutos antes
                        const horaLimite = new Date();
                        horaLimite.setHours(horas, minutos - 10, 0, 0);
                        if (horaActual > horaLimite) {
                            showAlert(`El track "${track}" ya ha cerrado para hoy. Por favor, selecciona otro track o fecha.`, "danger");
                            return;
                        }
                    }
                }
            }
        }

        // Validar jugadas
        let jugadasValidas = true;
        const jugadasArray = [];
        $("#tablaJugadas tr").each(function() {
            const numero = $(this).find(".numeroApostado").val();
            const modalidad = $(this).find(".tipoJuego").text();
            if (!numero || (numero.length < 2 || numero.length > 4)) {
                jugadasValidas = false;
                showAlert("Por favor, ingresa números apostados válidos (2, 3 o 4 dígitos).", "danger");
                return false; // Salir del each
            }
            if (modalidad === "-") {
                jugadasValidas = false;
                showAlert("Por favor, selecciona una modalidad de juego válida.", "danger");
                return false;
            }

            // Verificar que la jugada tiene al menos un track seleccionado correspondiente a su modalidad
            let tracksRequeridos = [];

            if (["Win 4", "Peak 3", "Pulito", "Pulito-Combinado", "Venezuela"].includes(modalidad)) {
                // Modalidades que requieren tracks de USA
                tracksRequeridos = Object.keys(horariosCierre.USA);
            } else if (["RD-Quiniela", "RD-Pale"].includes(modalidad)) {
                // Modalidades que requieren tracks de Santo Domingo
                tracksRequeridos = Object.keys(horariosCierre["Santo Domingo"]);
            } else {
                // Modalidad no reconocida o no requiere validación específica
                tracksRequeridos = [];
            }

            // Verificar si al menos uno de los tracks requeridos está seleccionado
            const tracksSeleccionadosParaModalidad = tracks.filter(track => tracksRequeridos.includes(track));

            if (tracksRequeridos.length > 0 && tracksSeleccionadosParaModalidad.length === 0) {
                jugadasValidas = false;
                showAlert(`La jugada con modalidad "${modalidad}" requiere al menos un track seleccionado correspondiente.`, "danger");
                return false; // Salir del each
            }

            // Validaciones específicas por modalidad
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

            // Validar límites
            if (limitesApuesta[modalidad]) {
                if (parseFloat($(this).find(".straight").val()) > (limitesApuesta[modalidad].straight || Infinity)) {
                    jugadasValidas = false;
                    showAlert(`El monto en Straight excede el límite para ${modalidad}.`, "danger");
                    return false;
                }
                if (limitesApuesta[modalidad].box !== undefined && modalidad !== "Pulito" && modalidad !== "Pulito-Combinado" && parseFloat($(this).find(".box").val()) > (limitesApuesta[modalidad].box || Infinity)) {
                    jugadasValidas = false;
                    showAlert(`El monto en Box excede el límite para ${modalidad}.`, "danger");
                    return false;
                }
                if (limitesApuesta[modalidad].combo !== undefined && parseFloat($(this).find(".combo").val()) > (limitesApuesta[modalidad].combo || Infinity)) {
                    jugadasValidas = false;
                    showAlert(`El monto en Combo excede el límite para ${modalidad}.`, "danger");
                    return false;
                }
            }

            // Agregar jugada al array
            const straight = parseFloat($(this).find(".straight").val()) || 0;
            const boxVal = $(this).find(".box").val();
            const box = boxVal !== "" ? boxVal : "-";
            const comboVal = $(this).find(".combo").val();
            const combo = comboVal !== "" ? parseFloat(comboVal) : "-";
            const total = parseFloat($(this).find(".total").text()) || 0;
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

        // Preparar datos para el ticket
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

        // Generar número de ticket único de 8 dígitos
        const numeroTicket = generarNumeroUnico();
        $("#numeroTicket").text(numeroTicket);

        // Generar la fecha y hora de transacción
        fechaTransaccion = dayjs().format('MM-DD-YYYY hh:mm A');
        $("#ticketTransaccion").text(fechaTransaccion);

        // Generar código QR
        $("#qrcode").empty(); // Limpiar el contenedor anterior
        new QRCode(document.getElementById("qrcode"), {
            text: numeroTicket,
            width: 128,
            height: 128,
        });

        // Mostrar las fechas de apuesta en el ticket
        $("#ticketFecha").text(fecha);
        console.log("Fechas asignadas a #ticketFecha:", $("#ticketFecha").text());

        // Preparar datos para enviar a SheetDB
        const ticketData = {
            numeroTicket: numeroTicket,
            fechaTransaccion: fechaTransaccion,
            fechasApuesta: fecha,
            tracks: tracksTexto,
            totalTicket: $("#totalJugadas").text()
        };

        // Preparar datos para las jugadas
        const jugadasData = jugadasArray.map(jugada => ({
            "Ticket Number": numeroTicket,
            "Bet Number": jugada.numero,
            "Game Mode": jugada.modalidad,
            "Straight ($)": jugada.straight.toFixed(2),
            "Box ($)": jugada.box !== "-" ? jugada.box : "",
            "Combo ($)": jugada.combo !== "-" ? jugada.combo.toFixed(2) : "",
            "Total ($)": jugada.total.toFixed(2),
            "Payment Method": "-", // Puedes ajustar esto según necesites
            "Jugada Number": generarNumeroUnico(),
            "Timestamp": new Date().toISOString()
        }));

        // Enviar los datos a SheetDB
        guardarTicket(ticketData);
        guardarJugadas(jugadasData);
    });

    /**
     * Guarda el ticket en SheetDB.
     * @param {Object} ticketData - Datos del ticket.
     */
    function guardarTicket(ticketData) {
        $.ajax({
            url: SHEETDB_API_URL_TICKETS,
            method: 'POST',
            dataType: 'json',
            contentType: 'application/json',
            data: JSON.stringify([ticketData]), // SheetDB espera un array de objetos
            success: function(response) {
                console.log('Ticket almacenado en SheetDB:', response);
                // Mostrar el modal después de almacenar el ticket
                ticketModal.show();
                // Mostrar u ocultar secciones según el rol del usuario
                if (localStorage.getItem('userRole') === 'admin') {
                    $('#confirmarPagoFormContainer').hide();
                    $('#confirmarTicketContainer').show();
                    $('#confirmarTicket').show();
                } else {
                    $('#confirmarPagoFormContainer').show();
                    $('#confirmarTicketContainer').hide();
                }
            },
            error: function(error) {
                console.error('Error al almacenar el ticket en SheetDB:', error);
                showAlert('Error al almacenar los datos del ticket. Por favor, inténtalo de nuevo.', 'danger');
            }
        });
    }

    /**
     * Guarda las jugadas en SheetDB.
     * @param {Array} jugadasData - Array de objetos con los datos de las jugadas.
     */
    function guardarJugadas(jugadasData) {
        $.ajax({
            url: SHEETDB_API_URL_JUGADAS,
            method: 'POST',
            dataType: 'json',
            contentType: 'application/json',
            data: JSON.stringify(jugadasData), // SheetDB espera un array de objetos
            success: function(response) {
                console.log('Jugadas almacenadas en SheetDB:', response);
                // Puedes agregar más lógica aquí si es necesario
            },
            error: function(error) {
                console.error('Error al almacenar las jugadas en SheetDB:', error);
                showAlert('Error al almacenar las jugadas. Por favor, inténtalo de nuevo.', 'danger');
            }
        });
    }

    /**
     * Evento para confirmar el pago manual.
     * Ahora, en lugar de enviar al backend, simplemente registramos la confirmación en SheetDB.
     */
    $("#confirmarPagoForm").submit(function(event) {
        event.preventDefault();
        $("#ticketAlerts").empty();

        const codigoTransaccion = $("#codigoTransaccion").val().trim();
        const archivoComprobante = $("#comprobantePago")[0].files[0];
        const numeroTicket = $("#numeroTicket").text();

        if (!codigoTransaccion) {
            showAlert("Por favor, ingresa el código de transacción.", "warning");
            return;
        }

        // Opcional: Puedes subir el comprobante a un servicio de almacenamiento y guardar la URL en SheetDB
        // Aquí, simplemente registramos la confirmación sin el comprobante

        const jugadaData = {
            "Ticket Number": numeroTicket,
            "Bet Number": "-", // No aplicable
            "Game Mode": "-", // No aplicable
            "Straight ($)": "-", // No aplicable
            "Box ($)": "-", // No aplicable
            "Combo ($)": "-", // No aplicable
            "Total ($)": "-", // No aplicable
            "Payment Method": "Pago Manual",
            "Jugada Number": generarNumeroUnico(),
            "Timestamp": new Date().toISOString()
        };

        // Puedes agregar más información según necesites

        $.ajax({
            url: SHEETDB_API_URL_JUGADAS,
            method: 'POST',
            dataType: 'json',
            contentType: 'application/json',
            data: JSON.stringify([jugadaData]),
            success: function(response) {
                console.log('Confirmación de pago almacenada en SheetDB:', response);
                showAlert("Pago confirmado exitosamente.", "success");
                // Opcional: Puedes cerrar el modal o actualizar la interfaz según necesites
            },
            error: function(error) {
                console.error('Error al confirmar el pago en SheetDB:', error);
                showAlert('Error al confirmar el pago. Por favor, inténtalo de nuevo.', "danger");
            }
        });
    });

    /**
     * Previsualiza el comprobante de pago al seleccionarlo.
     */
    $("#comprobantePago").change(function(event) {
        const archivo = event.target.files[0];
        if (archivo) {
            const lector = new FileReader();
            lector.onload = function(e) {
                $("#previsualizacionComprobante").html(`<img src="${e.target.result}" alt="Comprobante de Pago" class="img-fluid">`);
            }
            lector.readAsDataURL(archivo);
        } else {
            $("#previsualizacionComprobante").empty();
        }
    });

    /**
     * Evento para confirmar y generar el ticket final.
     * En esta versión, simplemente mostramos una alerta y procedemos a imprimir.
     */
    $("#confirmarTicket").click(function() {
        $("#ticketAlerts").empty();

        // Puedes agregar lógica adicional aquí si es necesario
        showAlert("Ticket generado exitosamente.", "success");

        // Imprimir el ticket
        window.print();

        // Capturar el ticket como imagen y descargarlo
        html2canvas(document.querySelector("#preTicket")).then(canvas => {
            const imgData = canvas.toDataURL("image/png");
            const link = document.createElement('a');
            link.href = imgData;
            link.download = 'ticket.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

        // Cerrar el modal y reiniciar el formulario
        ticketModal.hide();
        resetForm();

        // Limpiar datos locales si es necesario
    });

    /**
     * Confirma y guarda el ticket después de validar el pago.
     * Ahora, esta función no es necesaria ya que no hay backend.
     * Puedes eliminarla o dejarla vacía.
     */
    /*
    function confirmarYGuardarTicket(metodoPago) {
        // No se necesita en esta versión
    }
    */

    /**
     * Evento para reiniciar el formulario.
     */
    $("#resetForm").click(function() { resetForm(); });

    /**
     * Muestra las horas límite y actualiza el estado de los tracks.
     */
    function mostrarHorasLimite() {
        $(".cutoff-time").each(function() {
            const track = $(this).data("track");

            if (track === 'Venezuela') {
               $(this).text(`Disponible siempre`);
               return;
            }
            let cierreStr = "";
            if (horariosCierre.USA[track]) {
                cierreStr = horariosCierre.USA[track];
            }
            else if (horariosCierre["Santo Domingo"][track]) {
                cierreStr = horariosCierre["Santo Domingo"][track];
            }

            if (cierreStr) {
                const cierre = new Date(`1970-01-01T${cierreStr}:00`);
                cierre.setMinutes(cierre.getMinutes() - 10); // Restar 10 minutos
                const horas = cierre.getHours().toString().padStart(2, '0');
                const minutos = cierre.getMinutes().toString().padStart(2, '0');
                const horaLimite = `${horas}:${minutos}`;
                $(this).text(`Hora límite: ${horaLimite}`);
            }
        });
    }

    /**
     * Actualiza el estado de los tracks, deshabilitándolos 10 minutos antes de la hora de cierre.
     */
    function actualizarEstadoTracks() {
        const fechaVal = $("#fecha").val();
        if (!fechaVal) return;
        const fechaSeleccionadaStr = fechaVal.split(", ")[0];
        if (!fechaSeleccionadaStr) return;

        const [monthSel, daySel, yearSel] = fechaSeleccionadaStr.split('-').map(Number);
        const fechaSeleccionada = new Date(yearSel, monthSel - 1, daySel);

        const fechaActual = new Date();
        const esMismoDia = fechaSeleccionada.toDateString() === fechaActual.toDateString();

        // Si no es el mismo día, habilitar todos los tracks
        if (!esMismoDia) {
            $(".track-checkbox").prop('disabled', false).closest('label').removeClass('closed-track');
            return;
        }

        const ahora = new Date();
        const ahoraMinutos = ahora.getHours() * 60 + ahora.getMinutes();

        for (let region in horariosCierre) {
            for (let track in horariosCierre[region]) {
                // "Venezuela" nunca se deshabilita
                if (track === 'Venezuela') {
                    $(`.track-checkbox[value="${track}"]`).prop('disabled', false).closest('label').removeClass('closed-track');
                    continue;
                }

                const horaCierreStr = horariosCierre[region][track];
                const [horaCierre, minutoCierre] = horaCierreStr.split(":").map(Number);
                const horaCierreMinutos = horaCierre * 60 + minutoCierre;

                // 10 minutos antes del cierre
                const horaLimite = horaCierreMinutos - 10;

                if (ahoraMinutos >= horaLimite) {
                    $(`.track-checkbox[value="${track}"]`)
                        .prop('disabled', true)
                        .prop('checked', false)
                        .closest('label').addClass('closed-track');
                } else {
                    $(`.track-checkbox[value="${track}"]`)
                        .prop('disabled', false)
                        .closest('label').removeClass('closed-track');
                }
            }
        }
    }

    // Llamar a actualizarEstadoTracks al cargar la página y luego cada minuto
    actualizarEstadoTracks();
    setInterval(function() {
        actualizarEstadoTracks();
    }, 60000); // 60000 ms = 1 minuto

    /**
     * Evento delegado para detectar cambios en los checkboxes de tracks
     */
    $(".track-checkbox").change(function() {
        const tracksSeleccionados = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        // Excluir "Venezuela" del conteo de tracks para el cálculo del total
        selectedTracks = tracksSeleccionados.filter(track => track !== "Venezuela").length || 1;

        calcularTotal();
    });

    // Inicializar las horas límite al cargar la página
    mostrarHorasLimite();

    /**
     * Evento delegado para detectar cambios en los campos de número apostado y resaltar duplicados
     */
    $("#tablaJugadas").on("input", ".numeroApostado", function() {
        resaltarDuplicados();
    });

});
