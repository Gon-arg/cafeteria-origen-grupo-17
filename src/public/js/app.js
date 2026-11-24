/* =============================================================================
   Cafetería Origen — lógica del sitio público
   ============================================================================= */
(function () {
  'use strict';

  var API = '/api';
  var CARRITO_KEY = 'origen.carrito';

  var estado = {
    tipo: '',
    variedad: '',
    q: '',
    carrito: cargarCarrito(),
  };

  /* ---------------------------------------------------------------- utils */
  function $(sel) { return document.querySelector(sel); }

  function money(valor) {
    var n = Number(valor || 0);
    return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  }

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

  function api(url, opciones) {
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

  function guardarCarrito() {
    try {
      localStorage.setItem(CARRITO_KEY, JSON.stringify(estado.carrito));
    } catch (e) { /* almacenamiento no disponible */ }
  }

  function cargarCarrito() {
    try {
      return JSON.parse(localStorage.getItem(CARRITO_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  /* ------------------------------------------------------------- catálogo */
  function urlCatalogo() {
    var params = new URLSearchParams();
    if (estado.tipo) params.set('tipo', estado.tipo);
    if (estado.variedad) params.set('variedad', estado.variedad);
    if (estado.q) params.set('q', estado.q);
    var s = params.toString();
    return '/productos' + (s ? '?' + s : '');
  }

  function cargarProductos() {
    return api(urlCatalogo()).then(function (resp) {
      if (!resp.ok) {
        renderErrorProductos(resp.data && resp.data.error);
        return;
      }
      renderProductos(resp.data.productos);
      renderResultado(resp.data.filtros, resp.data.total);
    });
  }

  function renderProductos(productos) {
    var grid = $('#productos-grid');
    vaciar(grid);

    if (!productos || productos.length === 0) {
      grid.appendChild(el('p', 'empty', 'No encontramos productos con esos filtros.'));
      return;
    }

    productos.forEach(function (p) {
      window.__productos[p.id] = p;

      var tarjeta = el('article', 'product-card');

      var arriba = el('div', 'product-top');
      arriba.appendChild(el('h3', 'product-name', p.nombre));
      arriba.appendChild(el('span', 'product-price', money(p.precio)));
      tarjeta.appendChild(arriba);

      var tags = el('div', 'product-tags');
      tags.appendChild(el('span', 'tag', p.tipo));
      if (p.variedad) tags.appendChild(el('span', 'tag tag-origen', p.variedad));
      if (p.tamano) tags.appendChild(el('span', 'tag', p.tamano));
      tarjeta.appendChild(tags);

      tarjeta.appendChild(el('p', 'product-desc', p.descripcion));

      var boton = el('button', 'btn btn-ghost btn-agregar', 'Agregar');
      boton.setAttribute('data-id', String(p.id));
      tarjeta.appendChild(boton);

      grid.appendChild(tarjeta);
    });
  }

  function renderResultado(filtros, total) {
    var cont = $('#resultado-busqueda');

    if (filtros && filtros.q) {
      var fuerte = document.createElement('strong');
      fuerte.textContent = filtros.q;
      cont.textContent = '';
      cont.append('Resultados para ', fuerte, ' — ' + total + ' producto(s)');
    } else {
      cont.textContent = total + ' producto(s) en el menú';
    }
  }

  function renderErrorProductos(mensaje) {
    var grid = $('#productos-grid');
    vaciar(grid);
    grid.appendChild(el('p', 'empty', 'No se pudo cargar el menú: ' + (mensaje || 'error desconocido')));
  }

  /* --------------------------------------------------------------- carrito */
  function agregarAlCarrito(productoId) {
    var existente = null;
    for (var i = 0; i < estado.carrito.length; i++) {
      if (String(estado.carrito[i].id) === String(productoId)) existente = estado.carrito[i];
    }
    if (existente) {
      existente.cantidad += 1;
    } else {
      estado.carrito.push({
        id: productoId,
        nombre: window.__productos[productoId] ? window.__productos[productoId].nombre : 'Producto',
        precio: window.__productos[productoId] ? window.__productos[productoId].precio : 0,
        cantidad: 1,
      });
    }
    guardarCarrito();
    renderCarrito();
  }

  function cambiarCantidad(indice, delta) {
    var item = estado.carrito[indice];
    if (!item) return;
    item.cantidad += delta;
    if (item.cantidad <= 0) estado.carrito.splice(indice, 1);
    guardarCarrito();
    renderCarrito();
  }

  function quitarDelCarrito(indice) {
    estado.carrito.splice(indice, 1);
    guardarCarrito();
    renderCarrito();
  }

  function botonCarrito(texto, accion, indice, clase) {
    var b = el('button', clase || '', texto);
    b.type = 'button';
    b.setAttribute('data-acc', accion);
    b.setAttribute('data-i', String(indice));
    return b;
  }

  function renderCarrito() {
    var cont = $('#carrito');
    var lista = $('#resumen-carrito');
    var total = 0;

    vaciar(cont);
    vaciar(lista);

    if (estado.carrito.length === 0) {
      cont.appendChild(el('p', 'empty', 'El carrito está vacío.'));
      $('#resumen-total').textContent = money(0);
      return;
    }

    estado.carrito.forEach(function (item, i) {
      var subtotal = item.precio * item.cantidad;
      total += subtotal;

      var fila = el('div', 'cart-item');

      var info = el('div');
      info.appendChild(el('div', 'cart-item-name', item.nombre));
      info.appendChild(el('div', 'cart-item-meta', money(item.precio) + ' c/u'));
      fila.appendChild(info);

      var cantidad = el('div', 'qty-control');
      cantidad.appendChild(botonCarrito('−', 'menos', i));
      cantidad.appendChild(el('span', '', item.cantidad));
      cantidad.appendChild(botonCarrito('+', 'mas', i));
      fila.appendChild(cantidad);

      var derecha = el('div');
      derecha.appendChild(el('div', 'cart-item-price', money(subtotal)));
      derecha.appendChild(botonCarrito('Quitar', 'quitar', i, 'link-danger'));
      fila.appendChild(derecha);

      cont.appendChild(fila);

      var li = el('li');
      li.appendChild(el('span', '', item.nombre + ' × ' + item.cantidad));
      li.appendChild(el('span', '', money(subtotal)));
      lista.appendChild(li);
    });

    $('#resumen-total').textContent = money(total);
  }

  /* ---------------------------------------------------------------- pedidos */
  function enviarPedido(evento) {
    evento.preventDefault();
    var feedback = $('#pedido-feedback');
    feedback.className = 'form-feedback';
    feedback.textContent = 'Enviando…';

    postJSON('/pedidos', {
      mesa: $('#pedido-mesa').value,
      cliente: $('#pedido-cliente').value,
      items: estado.carrito.map(function (item) {
        return { productoId: item.id, cantidad: item.cantidad };
      }),
    }).then(function (resp) {
      if (!resp.ok) {
        feedback.className = 'form-feedback is-error';
        feedback.textContent = 'No pudimos enviar el pedido: ' + (resp.data.error || 'error desconocido');
        return;
      }
      feedback.className = 'form-feedback is-ok';
      feedback.textContent = '¡Pedido #' + resp.data.id + ' recibido! Total ' + money(resp.data.total) +
        '. Te atendemos en la mesa ' + resp.data.mesa + '.';
      estado.carrito = [];
      guardarCarrito();
      renderCarrito();
      $('#form-pedido').reset();
    }).catch(function () {
      feedback.className = 'form-feedback is-error';
      feedback.textContent = 'Error de conexión con el servidor.';
    });
  }

  /* --------------------------------------------------------------- reseñas */
  function cargarReseñas() {
    return api('/comentarios').then(function (resp) {
      var cont = $('#lista-resenas');
      vaciar(cont);

      if (!resp.ok || !resp.data.comentarios || resp.data.comentarios.length === 0) {
        cont.appendChild(el('p', 'empty', 'Todavía no hay reseñas. ¡Sé el primero!'));
        return;
      }

      resp.data.comentarios.forEach(function (c) {
        var estrellas = '';
        for (var i = 0; i < Number(c.calificacion || 0); i++) estrellas += '★';

        var nota = el('article', 'review');

        var cabecera = el('div', 'review-head');
        cabecera.appendChild(el('span', 'review-author', c.autor));
        cabecera.appendChild(el('span', 'review-stars', estrellas));
        nota.appendChild(cabecera);

        nota.appendChild(el('p', 'review-text', c.texto));
        cont.appendChild(nota);
      });
    });
  }

  function enviarReseña(evento) {
    evento.preventDefault();
    var feedback = $('#resena-feedback');
    feedback.className = 'form-feedback';
    feedback.textContent = 'Publicando…';

    postJSON('/comentarios', {
      autor: $('#resena-autor').value,
      texto: $('#resena-texto').value,
      calificacion: Number($('#resena-calificacion').value),
    }).then(function (resp) {
      if (!resp.ok) {
        feedback.className = 'form-feedback is-error';
        feedback.textContent = 'No se pudo publicar: ' + (resp.data.error || 'error desconocido');
        return;
      }
      feedback.className = 'form-feedback is-ok';
      feedback.textContent = '¡Gracias por tu reseña!';
      $('#form-resena').reset();
      cargarReseñas();
    });
  }

  /* ------------------------------------------------------------- listeners */
  function init() {
    window.__productos = {};

    // filtros
    document.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        estado.tipo = chip.getAttribute('data-tipo');
        cargarProductos();
      });
    });

    $('#filtro-variedad').addEventListener('change', function (e) {
      estado.variedad = e.target.value;
      cargarProductos();
    });

    var temporizador = null;
    $('#filtro-busqueda').addEventListener('input', function (e) {
      estado.q = e.target.value;
      clearTimeout(temporizador);
      temporizador = setTimeout(cargarProductos, 250);
    });

    // Carrito (delegación de eventos)
    $('#productos-grid').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-agregar');
      if (!btn) return;
      agregarAlCarrito(btn.getAttribute('data-id'));
    });

    $('#carrito').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var i = Number(btn.getAttribute('data-i'));
      var accion = btn.getAttribute('data-acc');
      if (accion === 'mas') cambiarCantidad(i, 1);
      else if (accion === 'menos') cambiarCantidad(i, -1);
      else if (accion === 'quitar') quitarDelCarrito(i);
    });

    $('#form-pedido').addEventListener('submit', enviarPedido);
    $('#form-resena').addEventListener('submit', enviarReseña);

    // Carga inicial
    api(urlCatalogo()).then(function (resp) {
      if (resp.ok) {
        (resp.data.productos || []).forEach(function (p) { window.__productos[p.id] = p; });
        renderProductos(resp.data.productos);
        renderResultado(resp.data.filtros, resp.data.total);
      } else {
        renderErrorProductos(resp.data.error);
      }
    });
    cargarReseñas();
    renderCarrito();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();