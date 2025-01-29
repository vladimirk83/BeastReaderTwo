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

    // Evento para resetear el formulario
    $("#resetForm").click(function() {
        if (confirm("¿Estás seguro de que deseas resetear el formulario? Esto eliminará todas las jugadas actuales.")) {
            resetForm();
        }
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
     * Habilita todos los tracks (usado cuando se selecciona solo fecha futura).
     */
    function habilitarTodosLosTracks() {
        $(".track-checkbox").each(function() {
            $(this).prop('disabled', false);
            $(this).closest('.form-check').find('.form-check-label').css({
                'opacity': '1',
                'cursor': 'pointer',
                'font-size': '1.125rem' // Aumentar tamaño de fuente
            });
        });
    }

    /**
     * Deshabilita pistas según la hora actual y sus horarios de cierre
     * PERO solo si el usuario ha incluido HOY en su selección de fechas.
     * Si solo selecciona fechas futuras, las pistas se mantienen habilitadas.
     */
    function deshabilitarTracksPorHora() {
        // Verificamos si el usuario incluyó HOY en su selección:
        const hoy = dayjs().startOf('day');
        const fechasSeleccionadas = $("#fecha").val();
        if (!fechasSeleccionadas) {
            // Si no ha seleccionado ninguna fecha, no deshabilitamos nada.
            habilitarTodosLosTracks();
            guardarEstadoFormulario();
            return;
        }

        const arrayFechas = fechasSeleccionadas.split(", ");
        let incluyeHoy = false;

        for (let fechaStr of arrayFechas) {
            const [monthSel, daySel, yearSel] = fechaStr.split('-').map(Number);
            const fechaEscogida = dayjs(new Date(yearSel, monthSel - 1, daySel)).startOf('day');
            if (fechaEscogida.isSame(hoy, 'day')) {
                incluyeHoy = true;
                break;
            }
        }

        // Si NO incluye hoy, entonces mantenemos todas habilitadas (para fechas futuras):
        if (!incluyeHoy) {
            habilitarTodosLosTracks();
            guardarEstadoFormulario();
            return;
        }

        // En caso de que sí incluya hoy, aplicamos la lógica original:
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
     * (Ya está definido más arriba; no lo tocamos.)
     */

    /**
     * Carga el estado del formulario desde localStorage.
     * (Ya está definido más arriba; no lo tocamos.)
     */

    // === Llamados finales ===

    // Mostramos los horarios de cierre al cargar la página
    mostrarHorasLimite();
    // Deshabilitamos/habilitamos pistas según la hora y/o la selección de fechas
    deshabilitarTracksPorHora();
    // Verificamos cada minuto si algo cambia (solo afecta si incluyen hoy)
    setInterval(deshabilitarTracksPorHora, 60000); // 60000 ms = 1 minuto

});
