/* =============================================================================
   Cafetería Origen — lógica del panel de administración
   ============================================================================= */
(function () {
  'use strict';

  var API = '/api';
  var usuario = null;
  var productosCache = {};

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function money(valor) {
    return Number(valor || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  }

  /* ------------------------------------------------------- helpers de DOM */
  // CORRECCIÓN XSS: todo el contenido dinámico se arma con nodos DOM y
  // textContent, que trata los datos como texto y nunca como HTML.
  function el(tag, clase, texto) {
    var nodo = document.createElement(tag);
    if (clase) nodo.className = clase;
    if (texto !== undefined && texto !== null) nodo.textContent = String(texto);
    return nodo;
  }

  function vaciar(nodo) {
    while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
  }

  // columnas: [['Texto', 'clase-opcional'], ...]
  function encabezado(columnas) {
    var thead = el('thead');
    var tr = el('tr');
    columnas.forEach(function (c) { tr.appendChild(el('th', c[1] || '', c[0])); });
    thead.appendChild(tr);
    return thead;
  }

  function filaVacia(tabla, texto, columnas) {
    vaciar(tabla);
    var tbody = el('tbody');
    var tr = el('tr');
    var td = el('td', 'empty', texto);
    td.colSpan = columnas;
    tr.appendChild(td);
    tbody.appendChild(tr);
    tabla.appendChild(tbody);
  }

  function renderKpis(contenedor, kpis) {
    vaciar(contenedor);
    kpis.forEach(function (k) {
      var caja = el('div', 'kpi');
      caja.appendChild(el('div', 'kpi-label', k.label));
      caja.appendChild(el('div', 'kpi-value', k.value));
      contenedor.appendChild(caja);
    });
  }

  /* ------------------------------------------------------------------ CSRF */
  // Lee la cookie csrf-token que entrega el servidor en /api/csrf-token.
  function leerCookie(nombre) {
    var partes = document.cookie ? document.cookie.split('; ') : [];
    for (var i = 0; i < partes.length; i++) {
      var par = partes[i];
      var igual = par.indexOf('=');
      if (igual > -1 && par.substring(0, igual) === nombre) {
        return decodeURIComponent(par.substring(igual + 1));
      }
    }
    return '';
  }

  // Pide el token CSRF al servidor (esto crea la cookie csrf-token). Requiere sesión.
  function pedirTokenCsrf() {
    return fetch('/api/csrf-token', { credentials: 'same-origin' })
      .then(function (res) { return res.json().catch(function () { return {}; }); })
      .catch(function () { return {}; });
  }

  // El servidor exige el token en la cookie, en la cabecera X-CSRF-Token
  // y en el body (_csrf). Se agrega a toda petición que no sea GET/HEAD.
  function api(url, opciones) {
    opciones = opciones || {};
    var metodo = (opciones.method || 'GET').toUpperCase();

    if (metodo !== 'GET' && metodo !== 'HEAD') {
      var token = leerCookie('csrf-token');
      var cuerpo = {};
      if (typeof opciones.body === 'string' && opciones.body) {
        try { cuerpo = JSON.parse(opciones.body); } catch (e) { cuerpo = {}; }
      }
      cuerpo._csrf = token;
      opciones.body = JSON.stringify(cuerpo);
      opciones.headers = Object.assign({}, opciones.headers, {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
      });
      opciones.credentials = 'same-origin';
    }

    return fetch(API + url, opciones).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function postJSON(url, cuerpo) {
    return api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function putJSON(url, cuerpo) {
    return api(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function patchJSON(url, cuerpo) {
    return api(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  // CORRECCIÓN XSS reflejado: el mensaje se inserta como texto, no como HTML.
  function feedback(caja, mensaje, ok) {
    caja.className = 'form-feedback ' + (ok ? 'is-ok' : 'is-error');
    caja.textContent = mensaje;
  }

  /* ------------------------------------------------------------------ login */
  function iniciarSesion(evento) {
    evento.preventDefault();
    var caja = $('#login-feedback');
    caja.className = 'form-feedback';

    postJSON('/auth/login', {
      username: $('#login-usuario').value,
      password: $('#login-password').value,
    }).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No pudimos iniciar sesión: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      usuario = resp.data.usuario;
      // Después del login se pide el token CSRF para que exista la cookie.
      pedirTokenCsrf().then(mostrarPanel);
    });
  }

  function cerrarSesion() {
    postJSON('/auth/logout', {}).then(function () {
      usuario = null;
      $('#vista-login').hidden = false;
      $('#vista-panel').hidden = true;
      $('#admin-user').textContent = '';
    });
  }

  function mostrarPanel() {
    $('#vista-login').hidden = true;
    $('#vista-panel').hidden = false;

    var cont = $('#admin-user');
    vaciar(cont);
    cont.append(
      'Sesión de ', el('strong', '', usuario.nombre),
      ' · rol: ', el('strong', '', usuario.rol)
    );

    $('#panel-bienvenida').textContent = 'Hola, ' + usuario.nombre;
    cargarTodo();
  }

  function cargarTodo() {
    cargarResumen();
    cargarPedidos();
    cargarProductos();
    cargarReportes();
    cargarUsuarios();
  }

  /* ---------------------------------------------------------------- resumen */
  function cargarResumen() {
    api('/reportes/facturacion').then(function (f) {
      api('/reportes/mas-vendido').then(function (m) {
        api('/reportes/cantidad-vendida').then(function (c) {
          var mas = m.data.producto;
          var kpis = [
            { label: 'Facturación total', value: money(f.data.facturado) },
            { label: 'Pedidos registrados', value: f.data.pedidos },
            { label: 'Producto más vendido', value: mas ? mas.nombre : '—' },
            {
              label: 'Unidades por tipo',
              value: Object.keys(c.data.cantidadVendida || {})
                .map(function (k) { return k + ': ' + c.data.cantidadVendida[k]; })
                .join(' · ') || '—',
            },
          ];
          renderKpis($('#kpis'), kpis);
        });
      });
    });
  }

  /* --------------------------------------------------------------- pedidos */
  var ESTADOS = ['abierto', 'preparando', 'listo', 'entregado'];

  function renderTablaPedidos(tabla, filas, conAcciones) {
    var columnas = [['#'], ['Mesa'], ['Cliente'], ['Estado'], ['Total', 'num'], ['Fecha']];
    if (conAcciones) columnas.push(['Acciones']);

    if (!filas || filas.length === 0) {
      filaVacia(tabla, 'No hay pedidos.', columnas.length);
      return;
    }

    vaciar(tabla);
    tabla.appendChild(encabezado(columnas));

    var tbody = el('tbody');
    filas.forEach(function (p) {
      var tr = el('tr');
      tr.appendChild(el('td', '', p.id));
      tr.appendChild(el('td', '', p.mesa));
      tr.appendChild(el('td', '', p.cliente));

      var tdEstado = el('td');
      tdEstado.appendChild(el('span', 'badge badge-' + String(p.estado), p.estado));
      tr.appendChild(tdEstado);

      tr.appendChild(el('td', 'num', money(p.total)));
      tr.appendChild(el('td', '', new Date(p.creado_en).toLocaleString('es-AR')));

      if (conAcciones) {
        var tdAcc = el('td');
        var select = el('select', 'sel-estado');
        select.setAttribute('data-pedido', String(p.id));
        ESTADOS.forEach(function (e) {
          var op = el('option', '', e);
          op.value = e;
          if (e === p.estado) op.selected = true;
          select.appendChild(op);
        });
        tdAcc.appendChild(select);
        tr.appendChild(tdAcc);
      }

      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
  }

  function cargarPedidos() {
    api('/pedidos').then(function (resp) {
      var pedidos = resp.data.pedidos || [];
      renderTablaPedidos($('#tabla-pedidos'), pedidos, true);
      renderTablaPedidos($('#tabla-ultimos'), pedidos.slice(0, 5), false);
    });
  }

  function cambiarEstado(evento) {
    var select = evento.target.closest('.sel-estado');
    if (!select) return;
    var id = select.getAttribute('data-pedido');
    patchJSON('/pedidos/' + id + '/estado', { estado: select.value }).then(function (resp) {
      if (!resp.ok) {
        alert('No se pudo cambiar el estado: ' + (resp.data.error || 'error'));
      }
      cargarPedidos();
    });
  }

  /* ------------------------------------------------------------- productos */
  function cargarProductos() {
    api('/productos').then(function (resp) {
      var productos = resp.data.productos || [];
      productosCache = {};

      var tabla = $('#tabla-productos');
      vaciar(tabla);
      tabla.appendChild(encabezado([['#'], ['Nombre'], ['Tipo'], ['Origen'], ['Precio', 'num'], ['Acciones']]));

      var tbody = el('tbody');
      productos.forEach(function (p) {
        productosCache[p.id] = p;

        var tr = el('tr');
        tr.appendChild(el('td', '', p.id));
        tr.appendChild(el('td', '', p.nombre));
        tr.appendChild(el('td', '', p.tipo));
        tr.appendChild(el('td', '', p.variedad || '—'));
        tr.appendChild(el('td', 'num', money(p.precio)));

        var tdAcc = el('td');
        var boton = el('button', 'link-danger', 'Borrar');
        boton.setAttribute('data-borrar', String(p.id));
        tdAcc.appendChild(boton);
        tr.appendChild(tdAcc);

        tbody.appendChild(tr);
      });
      tabla.appendChild(tbody);
    });
  }

  function guardarProducto(evento) {
    evento.preventDefault();
    var caja = $('#producto-feedback');
    var id = $('#producto-id').value;

    var cuerpo = {
      nombre: $('#p-nombre').value,
      tipo: $('#p-tipo').value,
      variedad: $('#p-variedad').value || null,
      tamano: $('#p-tamano').value || null,
      gramos: $('#p-gramos').value ? Number($('#p-gramos').value) : null,
      precio_base: Number($('#p-precio-base').value || 0),
      precio_por_gramo: Number($('#p-precio-gramo').value || 0),
      descripcion: $('#p-descripcion').value,
    };

    var peticion = id ? putJSON('/admin/productos/' + id, cuerpo) : postJSON('/admin/productos', cuerpo);

    peticion.then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No se pudo guardar: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      feedback(caja, 'Producto guardado correctamente.', true);
      $('#form-producto').reset();
      $('#producto-id').value = '';
      cargarProductos();
    });
  }

  function borrarProducto(evento) {
    var btn = evento.target.closest('[data-borrar]');
    if (!btn) return;
    var id = btn.getAttribute('data-borrar');
    if (!confirm('¿Borrar el producto #' + id + '?')) return;

    api('/admin/productos/' + id, { method: 'DELETE' }).then(function (resp) {
      if (!resp.ok) alert('No se pudo borrar: ' + (resp.data.error || 'error'));
      cargarProductos();
    });
  }

  function limpiarFormularioProducto() {
    $('#form-producto').reset();
    $('#producto-id').value = '';
  }

  /* ---------------------------------------------------------------- upload */
  function subirArchivo(evento) {
    evento.preventDefault();
    var caja = $('#upload-feedback');
    var input = $('#archivo-subida');
    if (!input.files || !input.files[0]) {
      feedback(caja, 'Elegí un archivo primero.', false);
      return;
    }

    var archivo = input.files[0];
    var lector = new FileReader();

    lector.onload = function () {
      var base64 = String(lector.result).split(',')[1] || '';
      postJSON('/admin/subir-archivo', {
        nombre: archivo.name,
        contenidoBase64: base64,
      }).then(function (resp) {
        if (!resp.ok) {
          feedback(caja, 'No se pudo subir: ' + (resp.data.error || 'error desconocido'), false);
          return;
        }
        feedback(caja, 'Archivo subido a ' + resp.data.url, true);
      });
    };

    lector.readAsDataURL(archivo);
  }

  /* -------------------------------------------------------------- reportes */
  function cargarReportes() {
    api('/reportes/facturacion').then(function (f) {
      api('/reportes/ticket-promedio').then(function (t) {
        api('/reportes/mas-vendido').then(function (m) {
          var mas = m.data.producto;
          var kpis = [
            { label: 'Facturación', value: money(f.data.facturado) },
            { label: 'Pedidos', value: f.data.pedidos },
            { label: 'Ticket promedio', value: money(t.data.promedio) },
            { label: 'Más vendido', value: mas ? mas.nombre + ' (' + mas.unidades + ')' : '—' },
          ];
          renderKpis($('#kpis-reportes'), kpis);
        });
      });
    });
  }

  function consultarVentas() {
    var caja = $('#reporte-feedback');
    var tabla = $('#tabla-ventas');
    var variedad = $('#reporte-variedad').value;

    api('/reportes/ventas-por-variedad?variedad=' + encodeURIComponent(variedad)).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'Error: ' + (resp.data.error || 'desconocido'), false);
        vaciar(tabla);
        return;
      }

      var ventas = resp.data.ventas || [];
      vaciar(tabla);
      tabla.appendChild(encabezado([['Origen'], ['Producto'], ['Unidades', 'num'], ['Total', 'num']]));

      var tbody = el('tbody');
      ventas.forEach(function (v) {
        var tr = el('tr');
        tr.appendChild(el('td', '', v.variedad));
        tr.appendChild(el('td', '', v.nombre));
        tr.appendChild(el('td', 'num', v.unidades));
        tr.appendChild(el('td', 'num', money(v.total)));
        tbody.appendChild(tr);
      });
      tabla.appendChild(tbody);

      feedback(caja, 'Consulta realizada.', true);
    });
  }

  /* -------------------------------------------------------------- usuarios */
  var ROLES = ['cliente', 'mozo', 'barista', 'admin'];

  function cargarUsuarios() {
    api('/admin/usuarios').then(function (resp) {
      var usuarios = resp.data.usuarios || [];

      var tabla = $('#tabla-usuarios');
      vaciar(tabla);
      tabla.appendChild(encabezado([['#'], ['Usuario'], ['Nombre'], ['Rol'], ['Acciones']]));

      var tbody = el('tbody');
      usuarios.forEach(function (u) {
        var tr = el('tr');
        tr.appendChild(el('td', '', u.id));
        tr.appendChild(el('td', '', u.username));
        tr.appendChild(el('td', '', u.nombre));

        var tdRol = el('td');
        tdRol.appendChild(el('span', u.rol === 'admin' ? 'badge badge-admin' : 'badge', u.rol));
        tr.appendChild(tdRol);

        var tdAcc = el('td');
        var select = el('select', 'sel-rol');
        select.setAttribute('data-usuario', String(u.id));
        ROLES.forEach(function (r) {
          var op = el('option', '', r);
          op.value = r;
          if (r === u.rol) op.selected = true;
          select.appendChild(op);
        });
        tdAcc.appendChild(select);
        tr.appendChild(tdAcc);

        tbody.appendChild(tr);
      });
      tabla.appendChild(tbody);
    });
  }

  function cambiarRol(evento) {
    var select = evento.target.closest('.sel-rol');
    if (!select) return;
    var id = select.getAttribute('data-usuario');

    putJSON('/admin/usuarios/' + id, { rol: select.value }).then(function (resp) {
      if (!resp.ok) alert('No se pudo actualizar: ' + (resp.data.error || 'error'));
      cargarUsuarios();
    });
  }

  function cambiarPassword(evento) {
    evento.preventDefault();
    var caja = $('#password-feedback');
    postJSON('/admin/cambiar-contrasena', { nueva: $('#nueva-password').value }).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No se pudo cambiar: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      feedback(caja, 'Contraseña actualizada.', true);
      $('#nueva-password').value = '';
    });
  }

  /* ----------------------------------------------------------- herramientas */
  function probarConexion(evento) {
    evento.preventDefault();
    var salida = $('#salida-conexion');
    salida.textContent = 'Probando…';

    postJSON('/admin/probar-conexion', { host: $('#conexion-host').value }).then(function (resp) {
      if (!resp.ok) {
        salida.textContent = 'Error: ' + (resp.data.error || 'desconocido');
        return;
      }
      salida.textContent =
        '$ ' + resp.data.comando + '\n\n' +
        (resp.data.salida || '') +
        (resp.data.error ? '\n[stderr]\n' + resp.data.error : '');
    });
  }

  function verDiagnostico() {
    var salida = $('#salida-diagnostico');
    salida.textContent = 'Cargando…';
    api('/_diagnostico').then(function (resp) {
      salida.textContent = JSON.stringify(resp.data, null, 2);
    });
  }

  /* ------------------------------------------------------------------ tabs */
  function activarTab(evento) {
    var tab = evento.target.closest('.tab');
    if (!tab) return;
    var vista = tab.getAttribute('data-vista');
    $$('.tab').forEach(function (t) { t.classList.remove('is-active'); });
    tab.classList.add('is-active');
    $$('.tab-panel').forEach(function (p) {
      p.classList.toggle('is-active', p.getAttribute('data-panel') === vista);
    });
  }

  /* ------------------------------------------------------------------ init */
  function init() {
    // CORRECCIÓN XSS de DOM: el parámetro de la URL se inserta como texto.
    var params = new URLSearchParams(window.location.search);
    var objetivo = params.get('vista');
    if (objetivo) {
      $('#panel-bienvenida').textContent = 'Panel ' + objetivo;
    }

    $('#form-login').addEventListener('submit', iniciarSesion);
    $('#btn-logout').addEventListener('click', cerrarSesion);
    $('#btn-refrescar').addEventListener('click', cargarTodo);
    $('#tabs').addEventListener('click', activarTab);
    $('#tabla-pedidos').addEventListener('change', cambiarEstado);
    $('#tabla-productos').addEventListener('click', borrarProducto);
    $('#form-producto').addEventListener('submit', guardarProducto);
    $('#btn-limpiar-producto').addEventListener('click', limpiarFormularioProducto);
    $('#form-upload').addEventListener('submit', subirArchivo);
    $('#form-password').addEventListener('submit', cambiarPassword);
    $('#btn-reporte-variedad').addEventListener('click', consultarVentas);
    $('#tabla-usuarios').addEventListener('change', cambiarRol);
    $('#form-conexion').addEventListener('submit', probarConexion);
    $('#btn-diagnostico').addEventListener('click', verDiagnostico);

    // ¿Ya hay sesión? Si la hay, también se pide el token CSRF.
    api('/auth/yo').then(function (resp) {
      if (resp.ok) {
        usuario = resp.data.usuario;
        pedirTokenCsrf().then(mostrarPanel);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();