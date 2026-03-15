const { createNamedStepEngine, printEvaluation } = require('./named-steps');
const { createDomainJexl, sampleContext } = require('../sample-domain');

async function runDemo() {
  const jexl = createDomainJexl();

  const steps = {
    activeCandidatePoints: 'sumPoints(candidates[.active == true])',
    ageComponent: 'ageScore(user.age)',
    rawScore: 'activeCandidatePoints + ageComponent',
    adjustedScore: 'applyAdjustment(rawScore, manualAdjustment)',
    decision:
      "adjustedScore > threshold ? segmentLabel(user.country) : 'review'",
  };

  const engine = createNamedStepEngine({
    jexl,
    steps,
    finalStep: 'decision',
  });

  const result = await engine.evaluate(sampleContext);

  console.log('='.repeat(80));
  console.log('Propuesta 3 - Pasos nombrados');
  console.log('='.repeat(80));
  console.log('Orden de evaluacion:', result.evaluationOrder.join(' -> '));
  console.log('Resultado final:', result.result);
  console.log('\nPasos calculados:\n');
  printEvaluation(result);
}

if (require.main === module) {
  runDemo().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  runDemo,
};
