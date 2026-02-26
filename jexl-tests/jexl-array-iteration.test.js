/**
 * Tests para el PoC de iteración de arreglos en JEXL
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  createJexlWithMap,
  addUtilityFunctions,
  addMapTransform,
  createJexlWithForEach,
  createJexlWithReduce,
  createJexlWithIterate,
  testContext,
} = require('./jexl-array-iteration');

describe('map con closure sobre contexto', () => {
  it('multiplica cada número por 2', async () => {
    const mapJexl = createJexlWithMap();
    const result = await mapJexl.evalWithMap(
      'map(numbers, "value * 2")',
      testContext
    );
    assert.deepStrictEqual(result, [2, 4, 6, 8, 10]);
  });

  it('usa variables del contexto (prefix)', async () => {
    const mapJexl = createJexlWithMap();
    const result = await mapJexl.evalWithMap(
      'map(employees, "prefix + \\": \\" + value.first")',
      testContext
    );
    assert.deepStrictEqual(result, [
      'Agent: Sterling',
      'Agent: Lana',
      'Agent: Cyril',
    ]);
  });

  it('combina con filter nativo de JEXL', async () => {
    const mapJexl = createJexlWithMap();
    const result = await mapJexl.evalWithMap(
      'map(employees[.active == true], "value.first + \\" \\" + value.last")',
      testContext
    );
    assert.deepStrictEqual(result, ['Sterling Archer', 'Lana Kane']);
  });
});

describe('addField', () => {
  it('agrega campo total = value * multiplier', async () => {
    const mapJexl = createJexlWithMap();
    const result = await mapJexl.evalWithMap(
      'map(items, "addField(value, \\"total\\", value.value * value.multiplier)")',
      testContext
    );
    assert.deepStrictEqual(result, [
      { key: 'a', value: 10, multiplier: 2, total: 20 },
      { key: 'b', value: 5, multiplier: 3, total: 15 },
      { key: 'c', value: 25, multiplier: 4, total: 100 },
    ]);
  });

  it('agrega campo usando fórmula custom calcularConImpuesto', async () => {
    const mapJexl = createJexlWithMap();
    const result = await mapJexl.evalWithMap(
      'map(items, "addField(value, \\"totalConImpuesto\\", calcularConImpuesto(value.value, value.multiplier))")',
      testContext
    );
    // 10*2*1.16=23.2, 5*3*1.16=17.4, 25*4*1.16=116
    assert.ok(Math.abs(result[0].totalConImpuesto - 23.2) < 0.01);
    assert.ok(Math.abs(result[1].totalConImpuesto - 17.4) < 0.01);
    assert.ok(Math.abs(result[2].totalConImpuesto - 116) < 0.01);
  });

  it('encadena addField para total y categoría (usando addFields para ambos)', async () => {
    const mapJexl = createJexlWithMap();
    const result = await mapJexl.evalWithMap(
      'map(items, "addFields(value, {total: value.value * value.multiplier, categoria: value.value * value.multiplier > 50 ? \\"alto\\" : \\"bajo\\"})")',
      testContext
    );
    assert.strictEqual(result[0].total, 20);
    assert.strictEqual(result[0].categoria, 'bajo');
    assert.strictEqual(result[2].total, 100);
    assert.strictEqual(result[2].categoria, 'alto');
  });
});

describe('addFields', () => {
  it('agrega múltiples campos a la vez', async () => {
    const mapJexl = createJexlWithMap();
    const result = await mapJexl.evalWithMap(
      'map(items, "addFields(value, {total: value.value * value.multiplier, categoria: value.value > 10 ? \\"A\\" : \\"B\\", procesado: true})")',
      testContext
    );
    assert.strictEqual(result[0].total, 20);
    assert.strictEqual(result[0].categoria, 'B'); // 10 no es > 10
    assert.strictEqual(result[0].procesado, true);
    assert.strictEqual(result[2].categoria, 'A'); // 25 > 10
  });
});

describe('mapTransform', () => {
  it('transforma array con expresión', async () => {
    const Jexl = require('jexl').Jexl;
    const jexl = new Jexl();
    addMapTransform(jexl);
    const result = await jexl.eval(
      'numbers|mapTransform("value * 3")',
      testContext
    );
    assert.deepStrictEqual(result, [3, 6, 9, 12, 15]);
  });
});

describe('forEach con index', () => {
  it('incluye index en el contexto', async () => {
    const forEachJexl = createJexlWithForEach();
    const result = await forEachJexl.evalWithForEach(
      'forEach(employees, "value.first + \\" (\\" + index + \\")\\"")',
      testContext
    );
    assert.deepStrictEqual(result, [
      'Sterling (0)',
      'Lana (1)',
      'Cyril (2)',
    ]);
  });
});

describe('reduce', () => {
  it('suma todos los números', async () => {
    const reduceJexl = createJexlWithReduce();
    const result = await reduceJexl.evalWithReduce(
      'reduce(numbers, 0, "accumulator + value")',
      testContext
    );
    assert.strictEqual(result, 15);
  });
});

describe('iterate', () => {
  it('procesa items con value e index', async () => {
    const iterateJexl = createJexlWithIterate();
    const result = await iterateJexl.evalWithIterate(
      'iterate(employees, "value.first + \\" - \\" + value.last")',
      testContext
    );
    assert.deepStrictEqual(result, [
      'Sterling - Archer',
      'Lana - Kane',
      'Cyril - Figgis',
    ]);
  });
});
