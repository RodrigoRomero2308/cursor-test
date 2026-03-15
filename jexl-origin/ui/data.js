/**
 * Datos de ejemplo para la UI de JEXL Origin.
 * Coinciden con la salida de los PoCs (01-ast-trace, 02-function-trace, 03-named-steps).
 */

const DEFAULT_CONTEXT = {
  user: { age: 42, monthlyIncome: 7500, country: "AR" },
  threshold: 10,
  manualAdjustment: 1,
  candidates: [
    { id: "a", active: true, points: 4 },
    { id: "b", active: false, points: 9 },
    { id: "c", active: true, points: 3 },
  ],
};

const DEFAULT_EXPRESSION =
  "applyAdjustment(sumPoints(candidates[.active == true]) + ageScore(user.age), manualAdjustment) > threshold ? segmentLabel(user.country) : 'review'";

const UI_DATA = {
  expression: DEFAULT_EXPRESSION,

  // Propuesta 1 - AST Trace (para vista Árbol y Formula navegable)
  astTrace: {
    expression:
      "applyAdjustment(sumPoints(candidates[.active == true]) + ageScore(user.age), manualAdjustment) > threshold ? segmentLabel(user.country) : 'review'",
    result: "perfil-local",
    trace: {
      id: "n1",
      type: "ConditionalExpression",
      label:
        "applyAdjustment(sumPoints(candidates[.active == true]) + ageScore(user.age), manualAdjustment) > threshold ? segmentLabel(user.country) : 'review'",
      value: "perfil-local",
      children: [
        {
          id: "n2",
          type: "BinaryExpression",
          label:
            "applyAdjustment(sumPoints(candidates[.active == true]) + ageScore(user.age), manualAdjustment) > threshold",
          value: true,
          children: [
            {
              id: "n3",
              type: "FunctionCall",
              label:
                "applyAdjustment(sumPoints(candidates[.active == true]) + ageScore(user.age), manualAdjustment)",
              value: 12,
              children: [
                {
                  id: "n4",
                  type: "BinaryExpression",
                  label:
                    "sumPoints(candidates[.active == true]) + ageScore(user.age)",
                  value: 11,
                  children: [
                    {
                      id: "n5",
                      type: "FunctionCall",
                      label: "sumPoints(candidates[.active == true])",
                      value: 7,
                      children: [
                        {
                          id: "n6",
                          type: "FilterExpression",
                          label: "candidates[.active == true]",
                          value: [
                            { id: "a", active: true, points: 4 },
                            { id: "c", active: true, points: 3 },
                          ],
                          iterations: [
                            { index: 0, passed: true, item: { id: "a", active: true, points: 4 } },
                            { index: 1, passed: false, item: { id: "b", active: false, points: 9 } },
                            { index: 2, passed: true, item: { id: "c", active: true, points: 3 } },
                          ],
                          children: [],
                        },
                      ],
                    },
                    {
                      id: "n7",
                      type: "FunctionCall",
                      label: "ageScore(user.age)",
                      value: 4,
                      children: [
                        {
                          id: "n8",
                          type: "Identifier",
                          label: "user.age",
                          value: 42,
                          children: [],
                        },
                      ],
                    },
                  ],
                },
                {
                  id: "n9",
                  type: "Identifier",
                  label: "manualAdjustment",
                  value: 1,
                  children: [],
                },
              ],
            },
            {
              id: "n10",
              type: "Identifier",
              label: "threshold",
              value: 10,
              children: [],
            },
          ],
        },
        {
          id: "n11",
          type: "FunctionCall",
          label: "segmentLabel(user.country)",
          value: "perfil-local",
          children: [
            {
              id: "n12",
              type: "Identifier",
              label: "user.country",
              value: "AR",
              children: [],
            },
          ],
        },
      ],
    },
  },

  // Propuesta 2 - Function trace (para Timeline de funciones)
  functionTrace: {
    expression:
      "applyAdjustment(sumPoints(candidates[.active == true]) + ageScore(user.age), manualAdjustment) > threshold ? segmentLabel(user.country) : 'review'",
    result: "perfil-local",
    calls: [
      { id: "fn-1", pool: "functions", name: "sumPoints", args: [[{ id: "a", active: true, points: 4 }, { id: "c", active: true, points: 3 }]], result: 7 },
      { id: "fn-2", pool: "functions", name: "ageScore", args: [42], result: 4 },
      { id: "fn-3", pool: "functions", name: "applyAdjustment", args: [11, 1], result: 12 },
      { id: "fn-4", pool: "functions", name: "segmentLabel", args: ["AR"], result: "perfil-local" },
    ],
  },

  // Propuesta 3 - Pasos nombrados (vista principal recomendada)
  namedSteps: {
    finalStep: "decision",
    result: "perfil-local",
    evaluationOrder: ["activeCandidatePoints", "ageComponent", "rawScore", "adjustedScore", "decision"],
    dependencyGraph: {
      activeCandidatePoints: [],
      ageComponent: [],
      rawScore: ["activeCandidatePoints", "ageComponent"],
      adjustedScore: ["rawScore"],
      decision: ["adjustedScore"],
    },
    steps: [
      { step: "activeCandidatePoints", expression: "sumPoints(candidates[.active == true])", dependsOn: [], value: 7 },
      { step: "ageComponent", expression: "ageScore(user.age)", dependsOn: [], value: 4 },
      { step: "rawScore", expression: "activeCandidatePoints + ageComponent", dependsOn: ["activeCandidatePoints", "ageComponent"], value: 11 },
      { step: "adjustedScore", expression: "applyAdjustment(rawScore, manualAdjustment)", dependsOn: ["rawScore"], value: 12 },
      { step: "decision", expression: "adjustedScore > threshold ? segmentLabel(user.country) : 'review'", dependsOn: ["adjustedScore"], value: "perfil-local" },
    ],
    stepLabels: {
      activeCandidatePoints: "Puntos por candidatos activos",
      ageComponent: "Componente de edad",
      rawScore: "Score bruto",
      adjustedScore: "Score ajustado",
      decision: "Decisión",
    },
  },
};

// Export para uso en navegador
if (typeof window !== "undefined") {
  window.UI_DATA = UI_DATA;
  window.DEFAULT_CONTEXT = DEFAULT_CONTEXT;
  window.DEFAULT_EXPRESSION = DEFAULT_EXPRESSION;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { UI_DATA };
}
