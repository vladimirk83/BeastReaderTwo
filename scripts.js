let fechaTransaccion = '';

$(document).ready(function() {

    // Define la URL de tu API de SheetDB  
    const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/gect4lbs5bwvr'; // Reemplaza con tu URL real

    // Inicializar Flatpickr con selección de rango de fechas
flatpickr("#fecha", {
    mode: "multiple",
    dateFormat: "m-d-Y", // Cambiado a MM-DD-YYYY
    minDate: "today",
    maxDate: null,
    defaultDate: null,
    allowInput: true,
    onChange: function(selectedDates, dateStr, instance) {
        selectedDays = selectedDates.length;
        console.log("Días seleccionados:", selectedDays);
        calcularTotal();
    },
});

    let jugadaCount = 0;
    let selectedTracks = 0;
    let selectedDays = 0;

    // Horarios de cierre por track
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
            // Nota: "Venezuela" se excluye aquí
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
            // Horarios especiales para domingos
            "Quiniela Pale Domingo": "15:30",
            "Nacional Domingo": "17:50"
        },
        "Venezuela": {
            "Venezuela": "19:00" // Asumiendo un horario de cierre para Venezuela
        }
    };

    // Límites de apuestas por modalidad
    const limitesApuesta = {
    "Win 4": { "straight": 6, "box": 30, "combo": 50 },
    "Peak 3": { "straight": 35, "box": 50, "combo": 70 },
    "Venezuela": { "straight": 100 },
    "Venezuela-Pale": { "straight": 100 },
    "Pulito": { "straight": 100 },
    "RD-Quiniela": { "straight": 100 }, // Actualizado a $100
    "RD-Pale": { "straight": 20 }, // Se mantiene en $20
    "Combo": { "combo": 50 } // Añadido
};
    // Modalidades de juego
    function determinarModalidad(tracks, numero, fila) {
        let modalidad = "-";

        const esUSA = tracks.some(track => Object.keys(horariosCierre["USA"]).includes(track));
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

    // Función para agregar una nueva jugada
    function agregarJugada() {
        if (jugadaCount >= 100) {
            alert("Has alcanzado el máximo de 100 jugadas.");
            return;
        }
        jugadaCount++;
        const fila =` 
            <tr>
                <td>${jugadaCount}</td>
                <td><input type="number" class="form-control numeroApostado" min="0" max="9999" required></td>
                <td class="tipoJuego">-</td>
                <td><input type="number" class="form-control straight" min="0" max="100.00" step="1" placeholder="Ej: 5"></td>
                <td><input type="number" class="form-control box" min="1" max="3" step="1" placeholder="1, 2 o 3"></td>
                <td><input type="number" class="form-control combo" min="0" max="50.00" step="0.10" placeholder="Ej: 3.00"></td>
                <td class="total">0.00</td>
            </tr>
        `;
        $("#tablaJugadas").append(fila);
    }

    // Agregar una jugada inicial
    agregarJugada();

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
        // Remover la última fila
        $("#tablaJugadas tr:last").remove();
        jugadaCount--;
        // Actualizar el número de jugadas
        $("#tablaJugadas tr").each(function(index) {
            $(this).find("td:first").text(index + 1);
        });
        calcularTotal();
    });

    // Contador de tracks seleccionados y días
$(".track-checkbox").change(function() {
    const tracksSeleccionados = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
    // Excluir "Venezuela" del conteo de tracks para el cálculo del total
    selectedTracks = tracksSeleccionados.filter(track => track !== "Venezuela").length || 1;

    calcularTotal();
});


 // $("#fecha").change(function() {
//     const fechas = $(this).val();
//     if (fechas) {
//         const fechasArray = fechas.split(", ");
//         selectedDays = fechasArray.length;
//     } else {
//         selectedDays = 0;
//     }
//     calcularTotal();
// });


    // Función para calcular la diferencia de días entre dos fechas
    function calcularDiferenciaDias(fechaInicio, fechaFin) {
        const inicio = new Date(fechaInicio);
        const fin = new Date(fechaFin);
        const diferencia = fin - inicio;
        return Math.floor(diferencia / (1000 * 60 * 60 * 24));
    }

    // Evento para detectar cambios en los campos de entrada
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

    // Función para actualizar los placeholders según la modalidad
    function actualizarPlaceholders(modalidad, fila) {
    if (limitesApuesta[modalidad]) {
        fila.find(".straight").attr("placeholder", `Máximo $${limitesApuesta[modalidad].straight}`).prop('disabled', false);
    } else {
        fila.find(".straight").attr("placeholder", "Ej: 5.00").prop('disabled', false);
    }

    if (modalidad === "Pulito") {
        fila.find(".box").attr("placeholder", "1, 2 o 3").prop('disabled', false);
        fila.find(".combo").attr("placeholder", "No aplica").prop('disabled', true).val('');
    } else if (modalidad === "Venezuela" || modalidad.startsWith("RD-")) {
        fila.find(".box").attr("placeholder", "No aplica").prop('disabled', true).val('');
        fila.find(".combo").attr("placeholder", "No aplica").prop('disabled', true).val('');
    } else if (modalidad === "Win 4" || modalidad === "Peak 3") {
        fila.find(".box").attr("placeholder", `Máximo $${limitesApuesta[modalidad].box}`).prop('disabled', false);
        fila.find(".combo").attr("placeholder", `Máximo $${limitesApuesta[modalidad].combo}`).prop('disabled', false);
    } else if (modalidad === "Combo") { // Añadido
        fila.find(".straight").attr("placeholder", "No aplica").prop('disabled', true).val('');
        fila.find(".box").attr("placeholder", "No aplica").prop('disabled', true).val('');
        fila.find(".combo").attr("placeholder", `Máximo $${limitesApuesta["Combo"].combo}`).prop('disabled', false);
    } else {
        // Modalidad no reconocida
        fila.find(".box").attr("placeholder", "Ej: 2.50").prop('disabled', false);
        fila.find(".combo").attr("placeholder", "Ej: 3.00").prop('disabled', false);
    }
}
    // Función para calcular el total de una jugada
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

    // Aplicar límites según modalidad
    if (limitesApuesta[modalidad]) {
        straight = Math.min(straight, limitesApuesta[modalidad].straight || straight);
        if (limitesApuesta[modalidad].box !== undefined && modalidad !== "Pulito") {
            box = Math.min(box, limitesApuesta[modalidad].box || box);
        }
        if (limitesApuesta[modalidad].combo !== undefined) {
            combo = Math.min(combo, limitesApuesta[modalidad].combo || combo);
        }
    }

    // Calcular total según modalidad
    let total = 0;
    if (modalidad === "Pulito") {
        total = straight; // No sumar box
    } else if (modalidad === "Venezuela" || modalidad.startsWith("RD-")) {
        total = straight;
    } else if (modalidad === "Win 4" || modalidad === "Peak 3") {
        total = straight + box + (combo * combinaciones);
    } else if (modalidad === "Combo") { // Añadido
        total = combo; // Solo sumar combo
    } else {
        // Modalidad no reconocida
        total = straight + box + combo;
    }

    fila.find(".total").text(total.toFixed(2));
}
    // Función para calcular el número de combinaciones posibles
    function calcularCombinaciones(numero) {
        const counts = {};
        for (let char of numero) {
            counts[char] = (counts[char] || 0) + 1;
        }
        let factorial = (n) => n <= 1 ? 1 : n * factorial(n - 1);
        let totalDigits = numero.length;
        let denominator = 1;
        for (let digit in counts) {
            denominator *= factorial(counts[digit]);
        }
        return factorial(totalDigits) / denominator;
    }

    // Función para calcular el total de todas las jugadas
    function calcularTotal() {
    let total = 0;
    $(".total").each(function() {
        total += parseFloat($(this).text()) || 0;
    });
    console.log("Total de jugadas antes de multiplicar:", total);
    console.log("Tracks seleccionados:", selectedTracks);
    console.log("Días seleccionados:", selectedDays);

    // Si no hay días seleccionados, el total es 0
    if (selectedDays === 0) {
        total = 0;
    } else {
        // Multiplicar por el número de tracks seleccionados y días
        total = (total * selectedTracks * selectedDays).toFixed(2);
    }
    console.log("Total después de multiplicar:", total);
    $("#totalJugadas").text(total);
}


    // Inicializar Bootstrap Modal
    var ticketModal = new bootstrap.Modal(document.getElementById('ticketModal'));

    // Función para obtener la hora límite de un track
    function obtenerHoraLimite(track) {
        for (let region in horariosCierre) {
            if (horariosCierre[region][track]) {
                return horariosCierre[region][track];
            }
        }
        return null;
    }

    // Evento para generar el ticket
    $("#generarTicket").click(function() {
        // Validar formulario
        const fecha = $("#fecha").val();
        console.log("Valor de fecha:", fecha);
        if (!fecha) {
            alert("Por favor, selecciona una fecha.");
            return;
        }
        const tracks = $(".track-checkbox:checked").map(function() { return $(this).val(); }).get();
        if (!tracks || tracks.length === 0) {
            alert("Por favor, selecciona al menos un track.");
            return;
        }

        // Validar que si se seleccionó el track "Venezuela", se haya seleccionado al menos un track de USA
        const tracksUSASeleccionados = tracks.filter(track => Object.keys(horariosCierre["USA"]).includes(track));
        if (tracks.includes("Venezuela") && tracksUSASeleccionados.length === 0) {
            alert("Para jugar en la modalidad 'Venezuela', debes seleccionar al menos un track de USA además de 'Venezuela'.");
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
                const horaLimite = new Date();
                const [horas, minutos] = horaLimiteStr.split(":");
                horaLimite.setHours(parseInt(horas), parseInt(minutos) - 5, 0, 0); // Restamos 5 minutos
                if (horaActual > horaLimite) {
                    alert(`El track "${track}" ya ha cerrado para hoy. Por favor, selecciona otro track o fecha.`);
                    return;
                }
            }
        }
    }
    
}

// Si la fecha seleccionada es futura, no se aplica la validación de hora
 
        // Validar jugadas
        let jugadasValidas = true;
        $("#tablaJugadas tr").each(function() {
            const numero = $(this).find(".numeroApostado").val();
            const modalidad = $(this).find(".tipoJuego").text();
            if (!numero || (numero.length < 2 || numero.length > 4)) {
                jugadasValidas = false;
                alert("Por favor, ingresa números apostados válidos (2, 3 o 4 dígitos).");
                return false;
            }
            if (modalidad === "-" ) {
                jugadasValidas = false;
                alert("Por favor, selecciona una modalidad de juego válida.");
                return false;              
            }

            // Nueva Validación: Verificar que la jugada tiene al menos un track seleccionado correspondiente a su modalidad
    let tracksRequeridos = [];

    if (["Win 4", "Peak 3", "Pulito", "Venezuela"].includes(modalidad)) {
        // Modalidades que requieren tracks de USA
        tracksRequeridos = Object.keys(horariosCierre["USA"]);
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
        alert(`La jugada con modalidad "${modalidad}" requiere al menos un track seleccionado correspondiente.`);
        return false; // Salir del bucle
    }

            if (["Venezuela", "Venezuela-Pale", "Pulito", "RD-Quiniela", "RD-Pale"].includes(modalidad)) {
                const straight = parseFloat($(this).find(".straight").val()) || 0;
                if (straight <= 0) {
                    jugadasValidas = false;
                    alert("Por favor, ingresa al menos una apuesta en Straight.");
                    return false;
                }
                if (modalidad === "Pulito") {
                    const box = parseInt($(this).find(".box").val());
                    if (![1, 2, 3].includes(box)) {
                        jugadasValidas = false;
                        alert("En la modalidad Pulito, el campo 'Box' debe ser 1, 2 o 3.");
                        return false;
                    }
                }
            } else if (["Win 4", "Peak 3"].includes(modalidad)) {
                const straight = parseFloat($(this).find(".straight").val()) || 0;
                const box = parseFloat($(this).find(".box").val()) || 0;
                const combo = parseFloat($(this).find(".combo").val()) || 0;
                if (straight <= 0 && box <= 0 && combo <= 0) {
                    jugadasValidas = false;
                    alert(`Por favor, ingresa al menos una apuesta en Straight, Box o Combo para ${modalidad}.`);
                    return false;
                }
            }           
            // Validar límites
            if (limitesApuesta[modalidad]) {
                if (parseFloat($(this).find(".straight").val()) > (limitesApuesta[modalidad].straight || Infinity)) {
                    jugadasValidas = false;
                    alert(`El monto en Straight excede el límite para ${modalidad}.`);
                    return false;
                }
                if (limitesApuesta[modalidad].box !== undefined && modalidad !== "Pulito" && parseFloat($(this).find(".box").val()) > (limitesApuesta[modalidad].box || Infinity)) {
                    jugadasValidas = false;
                    alert(`El monto en Box excede el límite para ${modalidad}.`);
                    return false;
                }
                if (limitesApuesta[modalidad].combo !== undefined && parseFloat($(this).find(".combo").val()) > (limitesApuesta[modalidad].combo || Infinity)) {
                    jugadasValidas = false;
                    alert(`El monto en Combo excede el límite para ${modalidad}.`);
                    return false;
                }
            }
        });
        if (!jugadasValidas) {
            return;
        }

        // Preparar datos para el ticket
        const tracksTexto = tracks.join(", ");
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
            const fila = 
                <tr>
                    <td>${$(this).find("td").first().text()}</td>
                    <td>${num}</td>
                    <td>${modalidad}</td>
                    <td>${straight.toFixed(2)}</td>
                    <td>${box !== "-" ? box : "-"}</td>
                    <td>${combo !== "-" ? combo.toFixed(2) : "-"}</td>
                    <td>${total.toFixed(2)}</td>
                </tr>
            ;
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
$("#ticketFecha").text(`${fecha}`);
console.log("Fechas asignadas a #ticketFecha:", $("#ticketFecha").text());        
        // Mostrar el modal usando Bootstrap 5
        ticketModal.show();
    });

    // Función para generar número único de ticket de 8 dígitos
    function generarNumeroUnico() {
        return Math.floor(10000000 + Math.random() * 90000000).toString();
    }

    // Evento para confirmar e imprimir el ticket
    // Evento para confirmar e imprimir el ticket
$("#confirmarTicket").click(function() {
    // Datos comunes a todas las jugadas
    const ticketNumber = $("#numeroTicket").text();
    const transactionDateTime = fechaTransaccion;
    const betDates = $("#ticketFecha").text();
    const tracks = $("#ticketTracks").text();
    const totalTicket = $("#ticketTotal").text();
    const timestamp = new Date().toISOString();

    // Array para almacenar las jugadas
    const jugadasData = [];

    // Recorrer cada jugada y preparar los datos
    $("#ticketJugadas tr").each(function() {
        // Generar número único de 8 dígitos para la jugada
        const jugadaNumber = generarNumeroUnico();

        const jugadaData = {
            "Ticket Number": ticketNumber,
            "Transaction DateTime": transactionDateTime,
            "Bet Dates": betDates,
            "Tracks": tracks,
            "Bet Number": $(this).find("td").eq(1).text(),
            "Game Mode": $(this).find("td").eq(2).text(),
            "Straight ($)": $(this).find("td").eq(3).text(),
            "Box ($)": $(this).find("td").eq(4).text() !== "-" ? $(this).find("td").eq(4).text() : "",
            "Combo ($)": $(this).find("td").eq(5).text() !== "-" ? $(this).find("td").eq(5).text() : "",
            "Total ($)": $(this).find("td").eq(6).text(),
            "Jugada Number": jugadaNumber,
            "Timestamp": timestamp
        };

        // Añadir la jugada al array
        jugadasData.push(jugadaData);
    });

    // Enviar datos a SheetDB
    $.ajax({
        url: SHEETDB_API_URL, // Usar la variable de SheetDB
        method: "POST",
        dataType: "json",
        contentType: "application/json",
        data: JSON.stringify(jugadasData),
        success: function(response) {
            // Imprimir el ticket
            window.print();

            // Opcional: Usar html2canvas para capturar solo el ticket
  html2canvas(document.querySelector("#preTicket")).then(canvas => {
    // Obtener la imagen en formato data URL
    const imgData = canvas.toDataURL("image/png");
    // Crear un enlace para descargar la imagen
    const link = document.createElement('a');
    link.href = imgData;
    link.download = 'ticket.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
            // Cerrar el modal
            ticketModal.hide();
            // Reiniciar el formulario
            resetForm();
            alert("Ticket guardado y enviado exitosamente.");
        },
        error: function(err) {
            console.error("Error al enviar datos a SheetDB:", err);
            // Mostrar mensaje de error más detallado
            alert("Hubo un problema al enviar los datos. Por favor, inténtalo de nuevo.\nDetalles del error: " + JSON.stringify(err));
        }
    });
});

    // Función para reiniciar el formulario
    function resetForm() {
        $("#lotteryForm")[0].reset();
        $("#tablaJugadas").empty();
        jugadaCount = 0;
        selectedTracks = 0;
        selectedDays = 0;
        agregarJugada();
        $("#totalJugadas").text("0.00");
        // Resetear los placeholders
        $("#tablaJugadas tr").each(function() {
            actualizarPlaceholders("-", $(this));
        });
    }

    // Calcular y mostrar las horas límite junto a cada track
    function mostrarHorasLimite() {
        $(".cutoff-time").each(function() {
            const track = $(this).data("track");
            let cierreStr = "";
            if (horariosCierre["USA"][track]) {
                cierreStr = horariosCierre["USA"][track];
            } else if (horariosCierre["Santo Domingo"][track]) {
                cierreStr = horariosCierre["Santo Domingo"][track];
            } else if (horariosCierre["Venezuela"][track]) {
                cierreStr = horariosCierre["Venezuela"][track];
            }
            if (cierreStr) {
                const cierre = new Date(1970-01-01T${cierreStr}:00);
                cierre.setMinutes(cierre.getMinutes() - 5); // 5 minutos antes
                const horas = cierre.getHours().toString().padStart(2, '0');
                const minutos = cierre.getMinutes().toString().padStart(2, '0');
                const horaLimite = ${horas}:${minutos};
                $(this).text(Hora límite: ${horaLimite});
            }
        });
       }

// Función para resaltar números duplicados
function resaltarDuplicados() {
    // Obtener todos los campos de número apostado
    const camposNumeros = document.querySelectorAll('.numeroApostado');
    const valores = {};
    const duplicados = new Set();

    // Recopilar valores y detectar duplicados
    camposNumeros.forEach(campo => {
        const valor = campo.value.trim();
        if (valor) {
            if (valores[valor]) {
                duplicados.add(valor);
            } else {
                valores[valor] = true;
            }
        }
    });

    // Aplicar o remover la clase .duplicado
    camposNumeros.forEach(campo => {
        if (duplicados.has(campo.value.trim())) {
            campo.classList.add('duplicado');
        } else {
            campo.classList.remove('duplicado');
        }
    });
}

// Función para agregar listeners a los campos de número apostado
function agregarListenersNumeroApostado() {
    const camposNumeros = document.querySelectorAll('.numeroApostado');
    camposNumeros.forEach(campo => {
        campo.removeEventListener('input', resaltarDuplicados); // Evitar duplicar listeners
        campo.addEventListener('input', resaltarDuplicados);
    });
}

// Agregar listeners al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    agregarListenersNumeroApostado();
    resaltarDuplicados(); // Resaltar duplicados al cargar, si los hay

    // Agregar listener al botón de agregar jugada
    const btnAgregarJugada = document.getElementById('agregarJugada');
    btnAgregarJugada.addEventListener('click', () => {
        setTimeout(() => {
            agregarListenersNumeroApostado();
            resaltarDuplicados();
        }, 100); // Esperar a que se agregue la nueva jugada
    });
});    
    // Llamar a la función para mostrar las horas límite al cargar la página
    mostrarHorasLimite();
