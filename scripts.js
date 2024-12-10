 // scripts.js

// Define the URL of your SheetDB API as a constant
const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/bl57zyh73b0ev'; // Reemplaza con tu URL real

let fechaTransaccion = '';
let jugadasData = []; // Definido en el ámbito global
let isProgrammaticReset = false; // Bandera para manejar reseteos programáticos

$(document).ready(function() {

    // Inicializar Flatpickr con selección múltiple de fechas
    flatpickr("#fecha", {
        mode: "multiple",
        dateFormat: "m-d-Y", // Formato MM-DD-YYYY
        minDate: "today",
        allowInput: true,
        onChange: function(selectedDates, dateStr, instance) {
            selectedDays = selectedDates.length;
            calcularTotal();
            guardarEstadoFormulario();
        },
    });

    let jugadaCount = 0;
    let selectedTracks = 0;
    let selectedDays = 0;

    // Horarios de cierre por pista
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
            // "Venezuela" está excluido aquí
        },
        "Santo Domingo": {
            "Real": "12:45",
            "Gana mas": "14:25",
            "Loteka": "19:30",
            "Nacional": "20:30", // Domingos a las 17:50
            "Quiniela Pale": "20:30", // Domingos a las 15:30
            "Primera Día": "11:50",
            "Suerte Día": "12:20",
            "Lotería Real": "12:50",
            "Suerte Tarde": "17:50",
            "Lotedom": "17:50",
            "Primera Noche": "19:50",
            "Panama": "16:00",
            // Horarios de cierre especiales para Domingos
            "Quiniela Pale Domingo": "15:30",
            "Nacional Domingo": "17:50"
        },
        "Venezuela": {
            "Venezuela": "19:00" // Asumiendo un horario de cierre para Venezuela
        }
    };

    // Límites de apuesta por modo de juego
    const limitesApuesta = {
        "Win 4": { "straight": 6, "box": 30, "combo": 50 },
        "Peak 3": { "straight": 35, "box": 50, "combo": 70 },
        "Venezuela": { "straight": 100 },
        "Venezuela-Pale": { "straight": 100 },
        "Pulito": { "straight": 100 },
        "RD-Quiniela": { "straight": 100 }, // Actualizado a $100
        "RD-Pale": { "straight": 20 }, // Permanece en $20
        "Combo": { "combo": 50 } // Añadido
    };

    /**
     * Determina el modo de juego basado en las pistas seleccionadas y el número de jugada.
     * @param {Array} tracks - Array de pistas seleccionadas.
     * @param {String} numero - Número de jugada.
     * @param {jQuery} fila - Fila de la jugada.
     * @returns {String} - Modo de juego.
     */
    function determinarModalidad(tracks, numero, fila) {
        let modalidad = "-";

        const esUSA = tracks.some(track => Object.keys(horariosCierre.USA).includes(track));
        const esSD = tracks.some(track => Object.keys(horariosCierre["Santo Domingo"]).includes(track));
        const incluyeVenezuela = tracks.includes("Venezuela");

        const longitud = numero.length;
        const boxValue = parseInt(fila.find(".box").val()) || 0;

        if (incluyeVenezuela && esUSA) {
            if (longitud === 2) {
                modalidad = "Venezuela";
            } else if (longitud === 4) {
                modalidad = "Venezuela-Pale"; // Asigna "Pale" para 4 dígitos
            }
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
     * Agrega una nueva jugada a la tabla.
     */
    function agregarJugada() {
        if (jugadaCount >= 100) {
            alert("Has alcanzado el máximo de 100 jugadas.");
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

        // Foco automático en el campo "Bet Number" de la nueva jugada
        $("#tablaJugadas tr:last .numeroApostado").focus();
    }

    // Agregar una jugada inicial
    agregarJugada();

    /**
     * Calcula el total de todas las jugadas considerando las pistas y días seleccionados.
     */
    function calcularTotal() {
        let total = 0;
        $(".total").each(function() {
            total += parseFloat($(this).text()) || 0;
        });

        // Si no se seleccionan días, el total es 0
        if (selectedDays === 0) {
            total = 0;
        } else {
            // Multiplica por el número de pistas seleccionadas y días
            total = (total * selectedTracks * selectedDays).toFixed(2);
        }

        $("#totalJugadas").text(total);
        guardarEstadoFormulario();
    }

    /**
     * Calcula el total para una jugada específica.
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
        let box = parseFloat(fila.find(".box").val()) || 0;
        let combo = parseFloat(fila.find(".combo").val()) || 0;

        // Aplicar límites según el modo de juego
        if (limitesApuesta[modalidad]) {
            straight = Math.min(straight, limitesApuesta[modalidad].straight || straight);
            if (limitesApuesta[modalidad].box !== undefined && modalidad !== "Pulito") {
                box = Math.min(box, limitesApuesta[modalidad].box || box);
            }
            if (limitesApuesta[modalidad].combo !== undefined) {
                combo = Math.min(combo, limitesApuesta[modalidad].combo || combo);
            }
        }

        // Calcular el total según el modo de juego
        let total = 0;
        if (modalidad === "Pulito") {
            total = straight; // No se añade box
        } else if (modalidad === "Venezuela" || modalidad.startsWith("RD-")) {
            total = straight;
        } else if (modalidad === "Win 4" || modalidad === "Peak 3") {
            total = straight + box + (combo * combinaciones);
        } else if (modalidad === "Combo") { // Añadido
            total = combo; // Solo se añade combo
        } else {
            // Modo de juego no reconocido
            total = straight + box + combo;
        }

        fila.find(".total").text(total.toFixed(2));
        calcularTotal();
    }

    /**
     * Calcula el número de combinaciones posibles para un número dado.
     * @param {String} numero - Número de jugada.
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
     * Actualiza los placeholders y estados de los campos según el modo de juego.
     * @param {String} modalidad - Modo de juego.
     * @param {jQuery} fila - Fila de la jugada.
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
        } else if (modalidad === "Venezuela" || modalidad.startsWith("RD-")) {
            fila.find(".box").attr("placeholder", "No aplica").prop('disabled', true).val('');
            fila.find(".combo").attr("placeholder", "No aplica").prop('disabled', true).val('');
        } else if (modalidad === "Win 4" || modalidad === "Peak 3") {
            fila.find(".box").attr("placeholder", `Max $${limitesApuesta[modalidad].box}`).prop('disabled', false);
            fila.find(".combo").attr("placeholder", `Max $${limitesApuesta[modalidad].combo}`).prop('disabled', false);
        } else if (modalidad === "Combo") { // Añadido
            fila.find(".straight").attr("placeholder", "No aplica").prop('disabled', true).val('');
            fila.find(".box").attr("placeholder", "No aplica").prop('disabled', true).val('');
            fila.find(".combo").attr("placeholder", `Max $${limitesApuesta.Combo.combo}`).prop('disabled', false);
        } else {
            // Modo de juego no reconocido
            fila.find(".box").attr("placeholder", "E.g., 2.50").prop('disabled', false);
            fila.find(".combo").attr("placeholder", "E.g., 3.00").prop('disabled', false);
        }

        guardarEstadoFormulario();
    }

    /**
     * Resalta los números de jugada duplicados.
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
     * Resetea el formulario a su estado inicial.
     */
    function resetForm() {
        isProgrammaticReset = true; // Establecer bandera para permitir reseteo programático
        $("#lotteryForm")[0].reset();
        $("#tablaJugadas").empty();
        jugadaCount = 0;
        selectedTracks = 0;
        selectedDays = 0;
        agregarJugada();
        $("#totalJugadas").text("0.00");
        mostrarHorasLimite();
        resaltarDuplicados();
        deshabilitarTracksPorHora(); // Asegurar que las pistas se re-verifiquen/deshabiliten tras el reseteo
        localStorage.removeItem('estadoFormulario'); // Limpiar estado guardado
        isProgrammaticReset = false; // Resetear bandera
    }

    /**
     * Calcula el total para una jugada específica y actualiza el total general.
     * @param {jQuery} fila - Fila de la jugada.
     */
    function calcularTotalJugadaAndUpdate(fila) {
        calcularTotalJugada(fila);
        calcularTotal();
    }

    // Evento para agregar más jugadas
    $("#agregarJugada").click(function() {
        agregarJugada();
    });

    // Evento para eliminar la última jugada
    $("#eliminarJugada").click(function() {
        if (jugadaCount === 0) {
            alert("No hay jugadas para eliminar.");
            return;
        }
        $("#tablaJugadas tr:last").remove();
        jugadaCount--;
        $("#tablaJugadas tr").each(function(index) {
            $(this).find("td:first").text(index + 1);
        });
        calcularTotal();
    });

    /**
     * Delegación de eventos para detectar cambios en los campos de entrada de las jugadas.
     * Utiliza delegación de eventos para manejar filas agregadas dinámicamente.
     */
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

    // Delegación de eventos para detectar cambios en las casillas de selección de pistas
    $(".track-checkbox").change(function() {
        const tracksSeleccionados = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        selectedTracks = tracksSeleccionados.filter(track => track !== "Venezuela").length || 1;
        calcularTotal();
    });

    var ticketModal = new bootstrap.Modal(document.getElementById('ticketModal'));

    /**
     * Obtiene la hora de cierre para una pista específica.
     * @param {String} track - Nombre de la pista.
     * @returns {String|null} - Hora de cierre en formato "HH:MM" o null si no se encuentra.
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
     * Aumenta el tamaño de la fuente para ciertos elementos.
     */
    function aumentarTamanoFuente() {
        // Aumentar el tamaño de fuente a 18px (~1.125rem) para coincidir con el título de la app
        $(".form-check-label").css("font-size", "1.125rem"); 
        $(".cutoff-time").css("font-size", "1.125rem");
    }

    /**
     * Muestra los horarios de cierre en el UI.
     */
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
                let cierreOriginal = dayjs(cierreStr, "HH:mm");
                let cierreFinal;

                // Determinar si la hora de cierre es después de las 21:30 PM
                if (cierreOriginal.isAfter(dayjs("21:30", "HH:mm"))) {
                    cierreFinal = dayjs("21:30", "HH:mm");
                } else {
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
     * Deshabilita pistas según la hora actual y sus horarios de cierre.
     */
    function deshabilitarTracksPorHora() {
        const ahora = dayjs();
        const limiteGlobal = dayjs().hour(21).minute(30).second(0); // 9:30 PM

        $(".track-checkbox").each(function() {
            const track = $(this).val();
            const cierreStr = obtenerHoraLimite(track);
            if (cierreStr) {
                let cierreOriginal = dayjs(cierreStr, "HH:mm");
                let cierreFinal;

                // Determinar hora límite de corte
                if (cierreOriginal.isAfter(dayjs("21:30", "HH:mm"))) {
                    cierreFinal = dayjs("21:30", "HH:mm");
                } else {
                    cierreFinal = cierreOriginal.subtract(10, 'minute');
                }

                if (ahora.isAfter(cierreFinal) || ahora.isSame(cierreFinal)) {
                    $(this).prop('disabled', true).prop('checked', false); // Desmarcar y deshabilitar si ha expirado
                    $(this).closest('.form-check').find('.form-check-label').css({
                        'opacity': '0.5',
                        'cursor': 'not-allowed',
                        'font-size': '1.125rem' // Aumentar tamaño de fuente
                    });
                    // Actualizar el cutoff time a 21:30 si aplica
                    if (cierreOriginal.isAfter(dayjs("21:30", "HH:mm"))) {
                        $(this).closest('.form-check').find('.cutoff-time').text("Cutoff Time: 21:30");
                    }
                } else {
                    $(this).prop('disabled', false);
                    $(this).closest('.form-check').find('.form-check-label').css({
                        'opacity': '1',
                        'cursor': 'pointer',
                        'font-size': '1.125rem' // Aumentar tamaño de fuente
                    });
                }
            }
        });

        guardarEstadoFormulario();
    }

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
            estado.jugadas.forEach((jugada, index) => {
                if (index >= 100) return; // Prevenir añadir más de 100 jugadas
                const fila = `
                    <tr>
                        <td>${index + 1}</td>
                        <td><input type="number" class="form-control numeroApostado" min="0" max="9999" required value="${jugada.numeroApostado}"></td>
                        <td class="tipoJuego">${jugada.tipoJuego}</td>
                        <td><input type="number" class="form-control straight" min="0" max="100.00" step="1" placeholder="E.g., 5" value="${jugada.straight}"></td>
                        <td><input type="number" class="form-control box" min="1" max="3" step="1" placeholder="1, 2 o 3" value="${jugada.box}"></td>
                        <td><input type="number" class="form-control combo" min="0" max="50.00" step="0.10" placeholder="E.g., 3.00" value="${jugada.combo}"></td>
                        <td class="total">${jugada.total}</td>
                    </tr>
                `;
                $("#tablaJugadas").append(fila);
            });
            jugadaCount = estado.jugadaCount;
            calcularTotal();
        }
    }

    // Cargar el estado del formulario al cargar la página
    cargarEstadoFormulario();

    /**
     * Previene el reseteo del formulario a menos que se active explícitamente mediante un botón de reset.
     */
    $("#lotteryForm").on("reset", function(e) {
        // Verifica si el reseteo fue iniciado por un botón con una clase específica
        if (!isProgrammaticReset && (!e.originalEvent || !$(e.originalEvent.submitter).hasClass("btn-reset"))) {
            e.preventDefault();
            // Se ha eliminado el alert según la solicitud
        }
    });

    /**
     * Maneja la generación y previsualización del ticket.
     */
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

        const tracksUSASeleccionados = tracks.filter(track => Object.keys(horariosCierre.USA).includes(track));
        if (tracks.includes("Venezuela") && tracksUSASeleccionados.length === 0) {
            alert("Para jugar en el modo 'Venezuela', debes seleccionar al menos un track de USA además de 'Venezuela'.");
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
                        let cierreOriginal = dayjs(horaLimiteStr, "HH:mm");
                        let cierreFinal;

                        if (cierreOriginal.isAfter(dayjs("21:30", "HH:mm"))) {
                            cierreFinal = dayjs("21:30", "HH:mm");
                        } else {
                            cierreFinal = cierreOriginal.subtract(10, 'minute');
                        }

                        if (horaActual.isAfter(cierreFinal) || horaActual.isSame(cierreFinal)) {
                            alert(`El track "${track}" ya ha cerrado para hoy. Por favor, selecciona otro track o una fecha futura.`);
                            return;
                        }
                    }
                }
            }
        }

        let jugadasValidas = true;
        jugadasData = []; // Reiniciar jugadasData antes de añadir nuevas
        const numeroTicket = generarNumeroUnico();

        // Establecer fechaTransaccion ANTES de construir jugadasData para asegurar su correcta guardada
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

            // Validaciones
            let error = false;

            // Validar número de jugada
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

            // Validar montos según modalidad
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
            } else if (["Win 4", "Peak 3"].includes(modalidad)) {
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

            // Aplicar límites de apuesta
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
            }

            if (!error) {
                jugadasData.push({
                    "Ticket Number": numeroTicket,
                    "Transaction DateTime": fechaTransaccion,
                    "Bet Dates": fecha, // Asegúrate de que sea una cadena, no un objeto de fecha o número serial
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
            alert(`Hay errores en las siguientes jugadas: ${jugadasTexto}. Por favor, corrígelas antes de generar el ticket.`);
            return;
        }

        // Preparar datos para el ticket
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

        // fechaTransaccion ya está establecida arriba
        $("#ticketTransaccion").text(fechaTransaccion);

        $("#numeroTicket").text(numeroTicket);

        // Ajustar el modal-dialog a extra grande antes de mostrarlo
        $(".modal-dialog").removeClass("modal-lg").addClass("modal-xl");

        // Ajustar estilos del contenido del modal para mejor visibilidad
        const $preTicket = $("#preTicket");
        $preTicket.css({
            "max-height": "80vh", // Limita la altura al 80% del viewport
            "overflow-y": "auto", // Habilita el desplazamiento vertical
            "width": "100%", // Ocupa todo el ancho disponible
            "height": "auto", // Ajusta la altura automáticamente
            "font-size": "14px", // Tamaño de fuente adecuado
            "white-space": "normal" // Permite el ajuste de líneas
        });

        // Generar código QR
        $("#qrcode").empty();
        new QRCode(document.getElementById("qrcode"), {
            text: numeroTicket,
            width: 128,
            height: 128,
        });

        $("#ticketFecha").text(fecha);
        console.log("Fechas de jugada asignadas a #ticketFecha:", $("#ticketFecha").text());

        ticketModal.show();

        // Guardar el estado actual después de generar el ticket
        guardarEstadoFormulario();
    });

    /**
     * Evento para confirmar y imprimir el ticket.
     * Captura el contenido del ticket, lo guarda en SheetDB, lo descarga como imagen y abre el diálogo de impresión.
     */
    $("#confirmarTicket").click(function() {
        const confirmarBtn = $(this);
        confirmarBtn.prop('disabled', true); // Deshabilitar el botón para prevenir múltiples clics

        const ticketElement = document.getElementById("preTicket");

        // Guardar los estilos originales
        const originalStyles = {
            width: $(ticketElement).css("width"),
            height: $(ticketElement).css("height"),
            maxHeight: $(ticketElement).css("max-height"),
            overflowY: $(ticketElement).css("overflow-y")
        };

        // Ajustar el contenedor para que muestre todo el contenido
        $(ticketElement).css({
            "width": "auto",
            "height": "auto",
            "max-height": "none",
            "overflow-y": "visible"
        });

        // Capturar la imagen después de un breve retraso para asegurar que los estilos se apliquen
        setTimeout(() => {
            html2canvas(ticketElement, { scale: 3 }).then(canvas => { // Aumentar scale a 3 para mayor resolución
                const imgData = canvas.toDataURL("image/png");
                const link = document.createElement('a');
                link.href = imgData;
                link.download = `ticket_${$("#numeroTicket").text()}.png`;

                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                // Actualización del mensaje de confirmación
                alert("El ticket se está descargando, por favor ábrelo y compártelo.");

                $(this).blur();

                guardarJugadas(jugadasData, function(success) {
                    if (success) {
                        window.print();
                        ticketModal.hide();
                        resetForm();
                    } else {
                        // No mostrar alerta si falla el guardado
                        window.print();
                        ticketModal.hide();
                        resetForm();
                    }
                });

            }).catch(error => {
                console.error("Error al capturar el ticket:", error);
                alert("Hubo un problema al generar el ticket. Por favor, intenta de nuevo.");
            }).finally(() => {
                // Restaurar los estilos originales
                $(ticketElement).css(originalStyles);

                confirmarBtn.prop('disabled', false); // Rehabilitar el botón
            });
        }, 500); // Retraso de 500ms
    });

    /**
     * Guarda las jugadas en SheetDB.
     * @param {Array} jugadasData - Array de objetos con datos de jugadas.
     * @param {Function} callback - Función a llamar después de intentar guardar.
     */
    function guardarJugadas(jugadasData, callback) {
        console.log("Enviando jugadasData a SheetDB:", JSON.stringify(jugadasData));

        $.ajax({
            url: SHEETDB_API_URL,
            method: "POST",
            dataType: "json",
            contentType: "application/json",
            data: JSON.stringify({ data: jugadasData }),
            success: function(response) {
                console.log("Jugadas almacenadas en SheetDB:", response);
                callback(true);
            },
            error: function(err) {
                console.error("Error al enviar datos a SheetDB:", err);
                callback(false);
            }
        });
    }

    /**
     * Genera un número único de 8 dígitos.
     * @returns {String} - Número único.
     */
    function generarNumeroUnico() {
        return Math.floor(10000000 + Math.random() * 90000000).toString();
    }

    /**
     * Muestra los horarios de cierre al cargar la página.
     */
    mostrarHorasLimite();

    /**
     * Deshabilita las pistas según la hora actual al cargar la página.
     */
    deshabilitarTracksPorHora();

    /**
     * Establece un intervalo para verificar cada minuto si alguna pista necesita ser deshabilitada.
     */
    setInterval(deshabilitarTracksPorHora, 60000); // 60000 ms = 1 minuto

});
