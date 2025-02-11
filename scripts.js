 // scripts.js

// URL de tu API de SheetDB (Reemplaza con la tuya real si usas SheetDB)
const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/bl57zyh73b0ev';

// Variables globales
let fechaTransaccion = '';
let jugadasData = [];
let isProgrammaticReset = false;
window.ticketDataUrl = null;  // Para guardar la imagen generada del ticket

// Inicializar Day.js con plugins
dayjs.extend(dayjs_plugin_customParseFormat);
dayjs.extend(dayjs_plugin_arraySupport);

$(document).ready(function() {

    // Inicializar Flatpickr con selección múltiple de fechas
    flatpickr("#fecha", {
        mode: "multiple",
        dateFormat: "m-d-Y",
        minDate: "today",
        allowInput: true,
        onChange: function(selectedDates, dateStr, instance) {
            selectedDays = selectedDates.length;
            calcularTotal();
            guardarEstadoFormulario();
            deshabilitarTracksPorHora();
        },
    });

    let jugadaCount = 0;      // Conteo de jugadas en la tabla
    let selectedTracks = 0;   // Conteo de tracks seleccionados (excluyendo "Venezuela")
    let selectedDays = 0;     // Conteo de días seleccionados en Flatpickr

    // Horarios de cierre por pista
    const horariosCierre = {
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
            // Nuevos tracks con mismas horas que NY Midday o Evening
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
            "Panama": "16:00",
            // Ejemplo de horarios de cierre para domingos:
            "Quiniela Pale Domingo": "14:30",
            "Nacional Domingo": "16:50"
        },
        "Venezuela": {
            "Venezuela": "19:00" 
        }
    };

    // Límites de apuesta por modo de juego
    const limitesApuesta = {
        "Win 4":      { "straight": 6,  "box": 30, "combo": 6 },
        "Pick 3":     { "straight": 35, "box": 50, "combo": 35 },
        "Venezuela":  { "straight": 100 },
        "Venezuela-Pale": { "straight": 100 },
        "Pulito":     { "straight": 100 },
        "RD-Quiniela":{ "straight": 100 },
        "RD-Pale":    { "straight": 20 }
    };

    /**
     * Determina el modo de juego según pistas seleccionadas y número apostado.
     * @param {Array} tracks - Array de pistas seleccionadas.
     * @param {String} numero - Número de jugada.
     * @param {jQuery} fila - Fila de la jugada.
     */
    function determinarModalidad(tracks, numero, fila) {
        let modalidad = "-";

        const esUSA = tracks.some(track => Object.keys(horariosCierre.USA).includes(track));
        const esSD = tracks.some(track => Object.keys(horariosCierre["Santo Domingo"]).includes(track));
        const incluyeVenezuela = tracks.includes("Venezuela");

        const longitud = numero.length;
        const boxValue = parseInt(fila.find(".box").val()) || 0;

        // Venezuela + USA
        if (incluyeVenezuela && esUSA) {
            if (longitud === 2) {
                modalidad = "Venezuela";
            } else if (longitud === 4) {
                modalidad = "Venezuela-Pale";
            }
        }
        // Solo USA
        else if (esUSA && !esSD) {
            if (longitud === 4) {
                modalidad = "Win 4";
            } else if (longitud === 3) {
                modalidad = "Pick 3"; // <--- Renombrado correcto
            } else if (longitud === 2 && [1, 2, 3].includes(boxValue)) {
                modalidad = "Pulito";
            }
        }
        // Solo Santo Domingo
        else if (esSD && !esUSA) {
            if (longitud === 2) {
                modalidad = "RD-Quiniela";
            } else if (longitud === 4) {
                modalidad = "RD-Pale";
            }
        }

        return modalidad;
    }

    /**
     * Agrega una nueva jugada, hasta un máximo de 25.
     */
    function agregarJugada() {
        // Límite 25 jugadas
        if (jugadaCount >= 25) {
            alert("Has alcanzado el máximo de 25 jugadas.");
            return;
        }
        jugadaCount++;
        const fila = `
            <tr>
                <td>${jugadaCount}</td>
                <td><input type="number" class="form-control numeroApostado" min="0" max="9999" required></td>
                <td class="tipoJuego">-</td>
                <td><input type="number" class="form-control straight" min="0" max="100.00" step="1" placeholder="E.g., 5"></td>
                <td><input type="number" class="form-control box" min="1" max="3" step="1" placeholder="1, 2 o 3"></td>
                <td><input type="number" class="form-control combo" min="0" max="50.00" step="0.10" placeholder="E.g., 3.00"></td>
                <td class="total">0.00</td>
            </tr>
        `;
        $("#tablaJugadas").append(fila);
        guardarEstadoFormulario();

        // Foco en el número apostado
        $("#tablaJugadas tr:last .numeroApostado").focus();
    }

    // Agregar jugada inicial
    agregarJugada();

    /**
     * Calcula el total de todas las jugadas (multiplicado por tracks y días).
     */
    function calcularTotal() {
        let total = 0;
        $(".total").each(function() {
            total += parseFloat($(this).text()) || 0;
        });

        // Sin días seleccionados => total 0
        if (selectedDays === 0) {
            total = 0;
        } else {
            total = (total * selectedTracks * selectedDays).toFixed(2);
        }

        $("#totalJugadas").text(total);
        guardarEstadoFormulario();
    }

    /**
     * Calcula el total de una jugada específica.
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

        // Aplicar límites
        if (limitesApuesta[modalidad]) {
            straight = Math.min(straight, limitesApuesta[modalidad].straight || straight);
            if (limitesApuesta[modalidad].box !== undefined && modalidad !== "Pulito") {
                box = Math.min(box, limitesApuesta[modalidad].box || box);
            }
            if (limitesApuesta[modalidad].combo !== undefined) {
                combo = Math.min(combo, limitesApuesta[modalidad].combo || combo);
            }
        }

        let total = 0;
        if (modalidad === "Pulito") {
            total = straight; // no se suma box ni combo
        } else if (modalidad === "Venezuela" || modalidad.startsWith("RD-")) {
            total = straight;
        } else if (modalidad === "Win 4" || modalidad === "Pick 3") {
            total = straight + box + (combo * combinaciones);
        } else {
            // Otros
            total = straight + box + combo;
        }

        fila.find(".total").text(total.toFixed(2));
        calcularTotal();
    }

    /**
     * Calcula combinaciones posibles para combos (ej. 122 => 3 combinaciones).
     */
    function calcularCombinaciones(numero) {
        const counts = {};
        for (let char of numero) {
            counts[char] = (counts[char] || 0) + 1;
        }
        const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));
        let totalDigits = numero.length;
        let denominator = 1;
        for (let digit in counts) {
            denominator *= factorial(counts[digit]);
        }
        return factorial(totalDigits) / denominator;
    }

    /**
     * Actualiza placeholders según modalidad.
     */
    function actualizarPlaceholders(modalidad, fila) {
        if (limitesApuesta[modalidad]) {
            fila.find(".straight").attr("placeholder", `Max $${limitesApuesta[modalidad].straight}`).prop('disabled', false);
        } else {
            fila.find(".straight").attr("placeholder", "E.g., 5.00").prop('disabled', false);
        }

        if (modalidad === "Pulito") {
            fila.find(".box").attr("placeholder", "1, 2 o 3").prop('disabled', false);
            fila.find(".combo").attr("placeholder", "No aplica").prop('disabled', true).val('');
        }
        else if (modalidad === "Venezuela" || modalidad.startsWith("RD-")) {
            fila.find(".box").attr("placeholder", "No aplica").prop('disabled', true).val('');
            fila.find(".combo").attr("placeholder", "No aplica").prop('disabled', true).val('');
        }
        else if (modalidad === "Win 4" || modalidad === "Pick 3") {
            fila.find(".box").attr("placeholder", `Max $${limitesApuesta[modalidad].box}`).prop('disabled', false);
            fila.find(".combo").attr("placeholder", `Max $${limitesApuesta[modalidad].combo}`).prop('disabled', false);
        }
        else {
            // Otros o no reconocido
            fila.find(".box").prop('disabled', false);
            fila.find(".combo").prop('disabled', false);
        }

        guardarEstadoFormulario();
    }

    /**
     * Resalta números duplicados (para detectar jugadas repetidas).
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

        guardarEstadoFormulario();
    }

    /**
     * Resetea el formulario entero a su estado inicial.
     */
    function resetForm() {
        isProgrammaticReset = true;
        $("#lotteryForm")[0].reset();
        $("#tablaJugadas").empty();
        jugadaCount = 0;
        selectedTracks = 0;
        selectedDays = 0;
        window.ticketDataUrl = null; // limpiar imagen
        agregarJugada(); // Agrega la primera jugada por defecto
        $("#totalJugadas").text("0.00");
        mostrarHorasLimite();
        resaltarDuplicados();
        deshabilitarTracksPorHora();
        localStorage.removeItem('estadoFormulario');
        isProgrammaticReset = false;
    }

    // -------------------- EVENTOS DEL DOM ----------------------------

    // Botón "Agregar Jugada"
    $("#agregarJugada").click(function() {
        agregarJugada();
    });

    // Botón "Eliminar" (quita la última jugada)
    $("#eliminarJugada").click(function() {
        if (jugadaCount === 0) {
            alert("No hay jugadas para eliminar.");
            return;
        }
        $("#tablaJugadas tr:last").remove();
        jugadaCount--;
        // Renumerar
        $("#tablaJugadas tr").each(function(index) {
            $(this).find("td:first").text(index + 1);
        });
        calcularTotal();
    });

    // Botón "Resetear Formulario"
    $("#resetForm").click(function() {
        if (confirm("¿Estás seguro de que deseas resetear el formulario? Se eliminarán todas las jugadas.")) {
            resetForm();
        }
    });

    // Cambios en campos dinámicos (numero, straight, box, combo)
    $("#tablaJugadas").on("input", ".numeroApostado, .straight, .box, .combo", function() {
        const fila = $(this).closest("tr");
        const num = fila.find(".numeroApostado").val();
        const tracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        const modalidad = determinarModalidad(tracks, num, fila);

        fila.find(".tipoJuego").text(modalidad);
        actualizarPlaceholders(modalidad, fila);
        calcularTotalJugada(fila);
        resaltarDuplicados();
    });

    // Cambio de selección de tracks
    $(".track-checkbox").change(function() {
        const tracksSeleccionados = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        // "Venezuela" no cuenta en el multiplicador
        selectedTracks = tracksSeleccionados.filter(track => track !== "Venezuela").length || 1;
        calcularTotal();
        deshabilitarTracksPorHora();
    });

    // Inicializar el modal (Bootstrap)
    const ticketModal = new bootstrap.Modal(document.getElementById('ticketModal'));

    // ----------------------- LOGICA DE HORARIOS Y CORTE ---------------------

    /**
     * Devuelve la hora-límite de un track. 
     */
    function obtenerHoraLimite(track) {
        for (let region in horariosCierre) {
            if (horariosCierre[region][track]) {
                return horariosCierre[region][track];
            }
        }
        return null;
    }

    function aumentarTamanoFuente() {
        $(".form-check-label").css("font-size", "1.125rem");
        $(".cutoff-time").css("font-size", "1.125rem");
    }

    /**
     * Muestra en pantalla la hora de corte para cada track. 
     * - Si supera las 21:30 => Forzamos a 22:00 sin restar 10 min
     * - Si no supera => restamos 10 min
     */
    function mostrarHorasLimite() {
        $(".cutoff-time").each(function() {
            const track = $(this).data("track");
            if (track === 'Venezuela') {
                // ocultar para Venezuela
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
                let cierreOriginal = dayjs(cierreStr, "HH:mm");
                let cierreFinal;

                // Si pasa de 21:30 => 22:00 en punto
                if (cierreOriginal.isAfter(dayjs("21:30", "HH:mm"))) {
                    cierreFinal = dayjs("22:00", "HH:mm");
                } else {
                    // De lo contrario => restar 10 minutos
                    cierreFinal = cierreOriginal.subtract(10, 'minute');
                }

                const horas = cierreFinal.format("HH");
                const minutos = cierreFinal.format("mm");
                const horaLimite = `${horas}:${minutos}`;
                $(this).text(`Cutoff Time: ${horaLimite}`);
            }
        });
        aumentarTamanoFuente();
    }

    /**
     * Verifica si el usuario incluyó la fecha de HOY en la selección.
     */
    function usuarioIncluyeHoy() {
        const hoy = dayjs().startOf('day');
        const fechasSeleccionadas = $("#fecha").val();
        if (!fechasSeleccionadas) return false;

        const arrayFechas = fechasSeleccionadas.split(", ");
        for (let fechaStr of arrayFechas) {
            const [monthSel, daySel, yearSel] = fechaStr.split('-').map(Number);
            const fechaSeleccionada = dayjs(new Date(yearSel, monthSel - 1, daySel)).startOf('day');
            if (fechaSeleccionada.isSame(hoy, 'day')) {
                return true;
            }
        }
        return false;
    }

    /**
     * Deshabilita/habilita tracks según la hora real y su cutoff.
     */
    function deshabilitarTracksPorHora() {
        // Si NO incluye hoy, no deshabilitamos nada
        if (!usuarioIncluyeHoy()) {
            habilitarTodasLasPistas();
            return;
        }

        const ahora = dayjs();
        $(".track-checkbox").each(function() {
            const track = $(this).val();
            const horaLimiteStr = obtenerHoraLimite(track);
            if (horaLimiteStr) {
                let cierreOriginal = dayjs(horaLimiteStr, "HH:mm");
                let cierreFinal;

                // Si supera 21:30 => 22:00
                if (cierreOriginal.isAfter(dayjs("21:30", "HH:mm"))) {
                    cierreFinal = dayjs("22:00", "HH:mm");
                } else {
                    // Resta 10 min
                    cierreFinal = cierreOriginal.subtract(10, 'minute');
                }

                if (ahora.isAfter(cierreFinal) || ahora.isSame(cierreFinal)) {
                    // Deshabilitar
                    $(this).prop('disabled', true).prop('checked', false);
                    $(this).closest('.form-check').find('.form-check-label').css({
                        'opacity': '0.5',
                        'cursor': 'not-allowed',
                        'font-size': '1.125rem'
                    });
                    // Mostrar 22:00 si superaba 21:30
                    if (cierreOriginal.isAfter(dayjs("21:30", "HH:mm"))) {
                        $(this).closest('.form-check').find('.cutoff-time').text("Cutoff Time: 22:00");
                    }
                } else {
                    // Habilitar
                    $(this).prop('disabled', false);
                    $(this).closest('.form-check').find('.form-check-label').css({
                        'opacity': '1',
                        'cursor': 'pointer',
                        'font-size': '1.125rem'
                    });
                }
            }
        });

        guardarEstadoFormulario();
    }

    /**
     * Habilita todas las pistas (usado cuando no es HOY).
     */
    function habilitarTodasLasPistas() {
        $(".track-checkbox").each(function() {
            $(this).prop('disabled', false);
            $(this).closest('.form-check').find('.form-check-label').css({
                'opacity': '1',
                'cursor': 'pointer',
                'font-size': '1.125rem'
            });
        });
    }

    // ----------------------- GUARDADO/RECUPERACIÓN DE ESTADO ---------------------------

    /**
     * Guarda el estado del formulario en localStorage.
     */
    function guardarEstadoFormulario() {
        const estado = {
            jugadaCount: jugadaCount,
            selectedTracks: selectedTracks,
            selectedDays: selectedDays,
            fecha: $("#fecha").val(),
            jugadas: []
        };

        $("#tablaJugadas tr").each(function() {
            const numero = $(this).find(".numeroApostado").val();
            const modalidad = $(this).find(".tipoJuego").text();
            const straight = $(this).find(".straight").val();
            const box = $(this).find(".box").val();
            const combo = $(this).find(".combo").val();
            const total = $(this).find(".total").text();
            estado.jugadas.push({
                numeroApostado: numero,
                tipoJuego: modalidad,
                straight: straight,
                box: box,
                combo: combo,
                total: total
            });
        });

        localStorage.setItem('estadoFormulario', JSON.stringify(estado));
    }

    /**
     * Carga el estado del formulario desde localStorage.
     */
    function cargarEstadoFormulario() {
        const estado = JSON.parse(localStorage.getItem('estadoFormulario'));
        if (estado) {
            $("#fecha").val(estado.fecha);
            selectedDays = estado.selectedDays;
            selectedTracks = estado.selectedTracks;
            jugadaCount = estado.jugadaCount;

            $("#tablaJugadas").empty();

            // Cargar jugadas sin exceder 25
            estado.jugadas.forEach((jugada, index) => {
                if (index >= 25) return;
                const fila = `
                    <tr>
                        <td>${index + 1}</td>
                        <td><input type="number" class="form-control numeroApostado" min="0" max="9999" required value="${jugada.numeroApostado}"></td>
                        <td class="tipoJuego">${jugada.tipoJuego}</td>
                        <td><input type="number" class="form-control straight" min="0" max="100.00" step="1" value="${jugada.straight}"></td>
                        <td><input type="number" class="form-control box" min="1" max="3" step="1" value="${jugada.box}"></td>
                        <td><input type="number" class="form-control combo" min="0" max="50.00" step="0.10" value="${jugada.combo}"></td>
                        <td class="total">${jugada.total}</td>
                    </tr>
                `;
                $("#tablaJugadas").append(fila);
            });

            // Ajustar jugadaCount si localStorage traía más de 25
            if (jugadaCount > 25) {
                jugadaCount = 25;
            }

            calcularTotal();
            mostrarHorasLimite();
            deshabilitarTracksPorHora();
            resaltarDuplicados();
        }
    }

    // Cargar al inicio
    cargarEstadoFormulario();

    // Evitar reset no deseado
    $("#lotteryForm").on("reset", function(e) {
        if (!isProgrammaticReset && (!e.originalEvent || !$(e.originalEvent.submitter).hasClass("btn-reset"))) {
            e.preventDefault();
        }
    });

    // -------------------- GENERAR TICKET (Modal) ----------------------

    // Botón "Generar Ticket"
    $("#generarTicket").click(function() {
        const fecha = $("#fecha").val();
        if (!fecha) {
            alert("Por favor, selecciona una fecha.");
            return;
        }
        const tracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        if (!tracks || tracks.length === 0) {
            alert("Por favor, selecciona al menos un track.");
            return;
        }

        // Verificar que si está "Venezuela", haya uno de USA
        const tracksUSASeleccionados = tracks.filter(track => Object.keys(horariosCierre.USA).includes(track));
        if (tracks.includes("Venezuela") && tracksUSASeleccionados.length === 0) {
            alert("Para jugar en 'Venezuela', debes seleccionar al menos un track de USA además de 'Venezuela'.");
            return;
        }

        // Validar hora de corte si la fecha incluye HOY
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
                        let cierreOriginal = dayjs(horaLimiteStr, "HH:mm");
                        let cierreFinal;
                        if (cierreOriginal.isAfter(dayjs("21:30", "HH:mm"))) {
                            cierreFinal = dayjs("22:00", "HH:mm");
                        } else {
                            cierreFinal = cierreOriginal.subtract(10, 'minute');
                        }
                        if (horaActual.isAfter(cierreFinal) || horaActual.isSame(cierreFinal)) {
                            alert(`El track "${track}" ya ha cerrado para hoy. Selecciona otro track o una fecha futura.`);
                            return;
                        }
                    }
                }
            }
        }

        // Validar jugadas
        let jugadasValidas = true;
        jugadasData = [];
        const numeroTicket = generarNumeroUnico();
        fechaTransaccion = dayjs().format('MM/DD/YYYY hh:mm A');
        const tracksTexto = tracks.join(", ");
        const jugadasConErrores = [];

        $("#tablaJugadas tr").each(function() {
            const numero = $(this).find(".numeroApostado").val();
            const modalidad = $(this).find(".tipoJuego").text();
            const straight = $(this).find(".straight").val();
            const box = $(this).find(".box").val();
            const combo = $(this).find(".combo").val();
            const total = $(this).find(".total").text();
            const jugadaNumero = parseInt($(this).find("td:first").text());

            let error = false;

            // Validar número
            if (!numero || numero.length < 2 || numero.length > 4) {
                error = true;
                jugadasConErrores.push(jugadaNumero);
                $(this).find(".numeroApostado").addClass('error-field');
            } else {
                $(this).find(".numeroApostado").removeClass('error-field');
            }

            // Validar modalidad
            if (modalidad === "-") {
                error = true;
                jugadasConErrores.push(jugadaNumero);
            }

            // Validar montos
            if (["Venezuela", "Venezuela-Pale", "Pulito", "RD-Quiniela", "RD-Pale"].includes(modalidad)) {
                if (!straight || parseFloat(straight) <= 0) {
                    error = true;
                    jugadasConErrores.push(jugadaNumero);
                    $(this).find(".straight").addClass('error-field');
                } else {
                    $(this).find(".straight").removeClass('error-field');
                }

                if (modalidad === "Pulito") {
                    const boxVal = parseInt(box);
                    if (![1, 2, 3].includes(boxVal)) {
                        error = true;
                        jugadasConErrores.push(jugadaNumero);
                        $(this).find(".box").addClass('error-field');
                    } else {
                        $(this).find(".box").removeClass('error-field');
                    }
                }
            } else if (["Win 4", "Pick 3"].includes(modalidad)) {
                // Necesita al menos un monto > 0
                if ((!straight || parseFloat(straight) <= 0) && 
                    (!box || parseFloat(box) <= 0) && 
                    (!combo || parseFloat(combo) <= 0)) {
                    error = true;
                    jugadasConErrores.push(jugadaNumero);
                    $(this).find(".straight").addClass('error-field');
                    $(this).find(".box").addClass('error-field');
                    $(this).find(".combo").addClass('error-field');
                } else {
                    if (straight && parseFloat(straight) > 0) {
                        $(this).find(".straight").removeClass('error-field');
                    }
                    if (box && parseFloat(box) > 0) {
                        $(this).find(".box").removeClass('error-field');
                    }
                    if (combo && parseFloat(combo) > 0) {
                        $(this).find(".combo").removeClass('error-field');
                    }
                }
            }

            // Aplicar límites
            if (limitesApuesta[modalidad]) {
                if (straight && parseFloat(straight) > (limitesApuesta[modalidad].straight || Infinity)) {
                    error = true;
                    jugadasConErrores.push(jugadaNumero);
                    $(this).find(".straight").addClass('error-field');
                }

                if (limitesApuesta[modalidad].box !== undefined && modalidad !== "Pulito") {
                    if (box && parseFloat(box) > (limitesApuesta[modalidad].box || Infinity)) {
                        error = true;
                        jugadasConErrores.push(jugadaNumero);
                        $(this).find(".box").addClass('error-field');
                    }
                }

                if (limitesApuesta[modalidad].combo !== undefined) {
                    if (combo && parseFloat(combo) > (limitesApuesta[modalidad].combo || Infinity)) {
                        error = true;
                        jugadasConErrores.push(jugadaNumero);
                        $(this).find(".combo").addClass('error-field');
                    }
                }
            }

            if (error) {
                jugadasValidas = false;
            } else {
                jugadasData.push({
                    "Ticket Number": numeroTicket,
                    "Transaction DateTime": fechaTransaccion,
                    "Bet Dates": fecha,
                    "Tracks": tracksTexto,
                    "Bet Number": numero,
                    "Game Mode": modalidad,
                    "Straight ($)": straight ? parseFloat(straight).toFixed(2) : "",
                    "Box ($)": box && box !== "-" ? box : "",
                    "Combo ($)": combo && combo !== "-" ? parseFloat(combo).toFixed(2) : "",
                    "Total ($)": parseFloat(total).toFixed(2),
                    "Jugada Number": generarNumeroUnico(),
                    "Timestamp": dayjs().toISOString()
                });
            }
        });

        if (!jugadasValidas) {
            const jugadasUnicas = [...new Set(jugadasConErrores)];
            const jugadasTexto = jugadasUnicas.join(", ");
            alert(`Hay errores en las jugadas: ${jugadasTexto}. Corrige antes de generar el ticket.`);
            return;
        }

        // Llenar modal
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
        $("#ticketTransaccion").text(fechaTransaccion);
        $("#numeroTicket").text(numeroTicket);

        // Ajustar estilo del modal
        $(".modal-dialog").removeClass("modal-lg").addClass("modal-xl");
        const $preTicket = $("#preTicket");
        $preTicket.css({
            "max-height": "80vh",
            "overflow-y": "auto",
            "width": "100%",
            "height": "auto",
            "font-size": "14px",
            "white-space": "normal"
        });

        // Generar QR
        $("#qrcode").empty();
        new QRCode(document.getElementById("qrcode"), {
            text: numeroTicket,
            width: 128,
            height: 128,
        });

        $("#ticketFecha").text(fecha);
        ticketModal.show();
        guardarEstadoFormulario();
    });

    // Botón "Confirmar e Imprimir"
    $("#confirmarTicket").click(function() {
        const confirmarBtn = $(this);
        confirmarBtn.prop('disabled', true);

        const ticketElement = document.getElementById("preTicket");
        const originalStyles = {
            width: $(ticketElement).css("width"),
            height: $(ticketElement).css("height"),
            maxHeight: $(ticketElement).css("max-height"),
            overflowY: $(ticketElement).css("overflow-y")
        };

        // Expandir para capturar con html2canvas
        $(ticketElement).css({
            "width": "auto",
            "height": "auto",
            "max-height": "none",
            "overflow-y": "visible"
        });

        setTimeout(() => {
            // Aumentar scale a 4 para mayor resolución
            html2canvas(ticketElement, { scale: 4 }).then(canvas => {
                // Guardar base64
                const imgData = canvas.toDataURL("image/png");
                window.ticketDataUrl = imgData;

                // Descargar la imagen
                const link = document.createElement('a');
                link.href = imgData;
                link.download = `ticket_${$("#numeroTicket").text()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                alert("El ticket se descargó en tu carpeta de descargas.");

                // Guardar en SheetDB
                guardarJugadas(jugadasData, function(success) {
                    if (success) {
                        console.log("Jugadas guardadas exitosamente en SheetDB.");
                    } else {
                        console.error("Error al guardar las jugadas en SheetDB.");
                    }
                    // Imprimir
                    window.print();
                    // Mostrar el botón de compartir
                    $("#shareTicket").removeClass("d-none");
                });

            }).catch(error => {
                console.error("Error al capturar el ticket:", error);
                alert("Hubo un problema al generar el ticket. Por favor, intenta de nuevo.");
            }).finally(() => {
                // Restaurar estilos
                $(ticketElement).css(originalStyles);
                confirmarBtn.prop('disabled', false);
            });
        }, 500);
    });

    // Botón "Compartir Ticket" (Web Share API con archivos)
    $("#shareTicket").click(async function() {
        if (!window.ticketDataUrl) {
            alert("No hay imagen de ticket generada para compartir.");
            return;
        }
        if (navigator.canShare) {
            try {
                const response = await fetch(window.ticketDataUrl);
                const blob = await response.blob();
                const file = new File([blob], "ticket.png", { type: "image/png" });

                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: "Ticket",
                        text: "Compartiendo Ticket"
                    });
                } else {
                    alert("Tu navegador no soporta compartir archivos. Comparte manualmente la imagen descargada.");
                }
            } catch(err) {
                console.error("Error al compartir:", err);
                alert("Error al intentar compartir el ticket.");
            }
        } else {
            alert("Tu navegador no soporta la función de compartir archivos. Usa la imagen descargada manualmente.");
        }
    });

    // -------------------- GUARDAR JUGADAS EN SHEETDB -----------------

    /**
     * Guarda las jugadas en SheetDB (o la API que uses).
     */
    function guardarJugadas(jugadasData, callback) {
        console.log("Enviando jugadasData a SheetDB:", JSON.stringify(jugadasData));

        fetch(SHEETDB_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: jugadasData })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Jugadas almacenadas en SheetDB:", data);
            callback(true);
        })
        .catch(error => {
            console.error("Error al enviar datos a SheetDB:", error);
            callback(false);
        });
    }

    /**
     * Genera un número único de 8 dígitos.
     */
    function generarNumeroUnico() {
        return Math.floor(10000000 + Math.random() * 90000000).toString();
    }

    // Al cargar la página
    mostrarHorasLimite();
    deshabilitarTracksPorHora();

    // Revisar cada minuto si la hora cambia
    setInterval(deshabilitarTracksPorHora, 60000);
});
