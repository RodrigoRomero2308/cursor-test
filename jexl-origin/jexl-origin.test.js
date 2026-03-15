const { describe, it } = require('node:test');
const assert = require('node:assert');
const { Jexl } = require('jexl');

const { traceExpression } = require('./01-ast-trace/ast-tracer');
const {
  createFunctionTraceRuntime,
} = require('./02-function-trace/function-trace');
const { createNamedStepEngine } = require('./03-named-steps/named-steps');
const {
  createDomainJexl,
  domainFunctions,
  sampleContext,
} = require('./sample-domain');

function findTrace(trace, predicate) {
  if (predicate(trace)) {
    return trace;
  }

  for (const child of trace.children || []) {
    const found = findTrace(child, predicate);
    if (found) {
      return found;
    }
  }

  for (const iteration of trace.iterations || []) {
    const found = findTrace(iteration.predicate, predicate);
    if (found) {
      return found;
    }
  }

  return null;
}

describe('Propuesta 1 - AST trace', () => {
  it('captura resultado final y subevaluaciones relevantes', async () => {
    const jexl = createDomainJexl();
    const expression =
      "applyAdjustment(sumPoints(candidates[.active == true]) + ageScore(user.age), manualAdjustment) > threshold ? segmentLabel(user.country) : 'review'";

    const traced = await traceExpression({
      jexl,
      expression,
      context: sampleContext,
    });

    assert.strictEqual(traced.result, 'perfil-local');
    const filterNode = findTrace(
      traced.trace,
      (node) => node.type === 'FilterExpression'
    );
    assert.ok(filterNode);
    assert.strictEqual(filterNode.iterations.length, 3);
    assert.deepStrictEqual(
      filterNode.iterations.map((iteration) => iteration.passed),
      [true, false, true]
    );
  });

  it('respeta short-circuit en operadores manualEval', async () => {
    const jexl = new Jexl();
    let explodeCalled = false;

    jexl.addFunction('explode', () => {
      explodeCalled = true;
      throw new Error('No deberia ejecutarse');
    });

    const traced = await traceExpression({
      jexl,
      expression: 'false && explode()',
      context: {},
    });

    assert.strictEqual(traced.result, false);
    assert.strictEqual(explodeCalled, false);
    assert.strictEqual(traced.trace.shortCircuited, true);
  });
});

describe('Propuesta 2 - function trace', () => {
  it('captura llamadas a funciones de dominio', async () => {
    const runtime = createFunctionTraceRuntime({
      functions: domainFunctions,
    });

    const traced = await runtime.evalWithTrace(
      'ageScore(user.age) + incomeScore(user.monthlyIncome)',
      sampleContext
    );

    assert.strictEqual(traced.result, 8);
    assert.deepStrictEqual(
      traced.calls.map((call) => call.name),
      ['ageScore', 'incomeScore']
    );
  });
});

describe('Propuesta 3 - named steps', () => {
  it('evalua cada paso una sola vez y expone dependencias', async () => {
    const engine = createNamedStepEngine({
      jexl: createDomainJexl(),
      steps: {
        activeCandidatePoints: 'sumPoints(candidates[.active == true])',
        ageComponent: 'ageScore(user.age)',
        rawScore: 'activeCandidatePoints + ageComponent',
        adjustedScore: 'applyAdjustment(rawScore, manualAdjustment)',
        decision:
          "adjustedScore > threshold ? segmentLabel(user.country) : 'review'",
      },
      finalStep: 'decision',
    });

    const result = await engine.evaluate(sampleContext);

    assert.strictEqual(result.result, 'perfil-local');
    assert.deepStrictEqual(result.dependencyGraph.rawScore.sort(), [
      'activeCandidatePoints',
      'ageComponent',
    ]);
    assert.deepStrictEqual(result.evaluationOrder, [
      'activeCandidatePoints',
      'ageComponent',
      'rawScore',
      'adjustedScore',
      'decision',
    ]);
  });
});
