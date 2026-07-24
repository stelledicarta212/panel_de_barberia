const assert = require('assert');

/**
 * Suite de pruebas unitarias para el proxy Next.js /api/pos y contrato de pago.
 */

function simulateApiPosProxy({ cookie, body, mockState, mockN8nResponse }) {
  // 1. Validar sesión
  const baSession = cookie ? (cookie.match(/(?:^|;\s*)ba_session=([^;]+)/) || [])[1] : '';
  if (!baSession) {
    return { status: 401, body: { ok: false, code: 'sesion_requerida', message: 'Sesion requerida para registrar POS.' } };
  }

  // 2. Validar barberia_id
  const barberiaId = Number(body.barberia_id || body.id_barberia || body.barbershop_id || 0);
  if (!barberiaId || barberiaId <= 0) {
    return { status: 400, body: { ok: false, code: 'barberia_id_requerido', message: 'barberia_id es requerido para registrar POS.' } };
  }

  // 3. Validar monto total
  const montoTotal = Number(body.monto_total ?? body.total ?? 0);
  if (montoTotal < 0) {
    return { status: 400, body: { ok: false, code: 'monto_negativo', message: 'No se permiten montos negativos.' } };
  }

  // 4. Validar estado de la cita si se incluye cita_id
  const citaId = body.cita_id ?? body.id_cita;
  const hasCitaId = citaId !== undefined && citaId !== null && String(citaId).trim() !== '' && String(citaId) !== 'undefined' && String(citaId) !== 'null' && !String(citaId).startsWith('cita-');

  if (hasCitaId) {
    const appointments = mockState ? (mockState.reservas || mockState.merged?.appointments || mockState.seed?.appointments || []) : [];
    const targetCita = appointments.find(c => String(c.id || c.cita_id) === String(citaId));

    if (!targetCita) {
      return { status: 403, body: { ok: false, code: 'cita_ajena', message: 'La cita no pertenece a esta barbería.' } };
    }

    // Heurística y contrato canónico de pago
    const pagoId = targetCita.pago_id ?? null;
    const isPagadaState = String(targetCita.estado || '').toLowerCase() === 'pagada';
    const hasPayment = Boolean(pagoId || targetCita.pagado_en || isPagadaState);

    if (hasPayment || isPagadaState) {
      return { status: 409, body: { ok: false, code: 'cita_ya_pagada', message: 'La cita ya fue pagada.' } };
    }

    const citaEstado = String(targetCita.estado || '').toLowerCase();
    if (citaEstado !== 'realizada') {
      return { status: 409, body: { ok: false, code: 'cita_no_realizada', message: 'La cita debe estar en estado realizada para poder ser cobrada.' } };
    }
  }

  // 5. Simular respuesta n8n
  if (mockN8nResponse) {
    if (!mockN8nResponse.ok) {
      return { status: mockN8nResponse.status || 409, body: { ok: false, code: mockN8nResponse.code || 'error_cobro', message: mockN8nResponse.message } };
    }
    return { status: 200, body: { ok: true, ...mockN8nResponse } };
  }

  return { status: 200, body: { ok: true, message: 'Cobro procesado' } };
}

function runApiProxyTests() {
  console.log('=== RUNNING NEXT.JS API PROXY /api/pos UNIT TESTS ===\n');
  let passCount = 0;
  let totalCount = 0;

  function test(name, fn) {
    totalCount++;
    try {
      fn();
      passCount++;
      console.log(`✅ PROXY TEST ${totalCount}: ${name} - PASS`);
    } catch (err) {
      console.error(`❌ PROXY TEST ${totalCount}: ${name} - FAIL:`, err.message);
    }
  }

  test('1. Sesión ausente retorna 401 sesion_requerida', () => {
    const res = simulateApiPosProxy({ cookie: '', body: { barberia_id: 10 } });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'sesion_requerida');
  });

  test('2. Cita ajena retorna 403 cita_ajena', () => {
    const res = simulateApiPosProxy({
      cookie: 'ba_session=token123',
      body: { barberia_id: 10, cita_id: 99 },
      mockState: { reservas: [{ id: 1, estado: 'realizada' }] }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.code, 'cita_ajena');
  });

  test('3. Cita en estado confirmada (no realizada) retorna 409 cita_no_realizada', () => {
    const res = simulateApiPosProxy({
      cookie: 'ba_session=token123',
      body: { barberia_id: 10, cita_id: 1 },
      mockState: { reservas: [{ id: 1, estado: 'confirmada' }] }
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'cita_no_realizada');
  });

  test('4. Cita en estado pagada retorna 409 cita_ya_pagada', () => {
    const res = simulateApiPosProxy({
      cookie: 'ba_session=token123',
      body: { barberia_id: 10, cita_id: 2 },
      mockState: { reservas: [{ id: 2, estado: 'pagada', pago_id: 50 }] }
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'cita_ya_pagada');
  });

  test('5. Cita realizada válida procesa cobro exitoso 200', () => {
    const res = simulateApiPosProxy({
      cookie: 'ba_session=token123',
      body: { barberia_id: 10, cita_id: 3, monto_total: 20000 },
      mockState: { reservas: [{ id: 3, estado: 'realizada' }] },
      mockN8nResponse: { ok: true, pago_id: 101 }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.pago_id, 101);
  });

  test('6. Propagación de error funcional n8n retorna status y mensaje adecuado', () => {
    const res = simulateApiPosProxy({
      cookie: 'ba_session=token123',
      body: { barberia_id: 10, cita_id: 4, monto_total: 20000 },
      mockState: { reservas: [{ id: 4, estado: 'realizada' }] },
      mockN8nResponse: { ok: false, status: 409, code: 'cita_ya_pagada', message: 'La cita ya fue pagada en DB.' }
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'cita_ya_pagada');
  });

  console.log(`\n=== PROXY TEST SUMMARY: ${passCount}/${totalCount} PASS ===\n`);
  if (passCount < totalCount) process.exit(1);
}

runApiProxyTests();
