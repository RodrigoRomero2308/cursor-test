const path = require('path');
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createDomainJexl, sampleContext, domainFunctions } = require('./sample-domain');
const { traceExpression } = require('./01-ast-trace/ast-tracer');
const { createFunctionTraceRuntime } = require('./02-function-trace/function-trace');

const PORT = process.env.PORT || 3333;
const POC_PASSWORD = process.env.POC_PASSWORD || '';
const JWT_SECRET = process.env.JWT_SECRET || POC_PASSWORD;
const TOKEN_EXPIRY = '24h';

const app = express();
app.use(express.json());

function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = authHeader.slice(7);
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

app.post('/api/auth', (req, res) => {
  if (!POC_PASSWORD) {
    return res.status(503).json({ error: 'Acceso no configurado' });
  }
  const password = req.body && req.body.password;
  if (typeof password !== 'string') {
    return res.status(400).json({ error: 'password requerido' });
  }
  if (!safeCompare(password, POC_PASSWORD)) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  const token = jwt.sign(
    { iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
  res.json({ token });
});

app.use('/api', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/auth') return next();
  return authMiddleware(req, res, next);
});

app.get('/api/default-context', (_req, res) => {
  res.json(sampleContext);
});

const helpBuiltIn = [
  { name: 'Operadores aritméticos', description: '+ - * / %', example: 'a + b' },
  { name: 'Comparación', description: '== != < > <= >=', example: 'x > 10' },
  { name: 'Lógicos', description: '&& ||', example: 'a && b' },
  { name: 'Condicional', description: 'condición ? valorSiTrue : valorSiFalse', example: "age >= 18 ? 'adulto' : 'menor'" },
  { name: 'Acceso a propiedades', description: 'objeto.propiedad o array[índice]', example: 'user.age' },
  { name: 'Filtro en arrays', description: 'array[.propiedad == valor]', example: 'candidates[.active == true]' },
  { name: 'Literales', description: "Números, strings con ' o \"", example: "'texto' o 42" },
];

const customHelp = {
  ageScore: 'Puntaje por edad del usuario.',
  incomeScore: 'Puntaje por ingreso mensual.',
  sumPoints: 'Suma los puntos de una lista de ítems.',
  applyAdjustment: 'Ajusta un valor base con un delta.',
  segmentLabel: 'Etiqueta de segmento según país (ej. perfil-local).',
};

app.get('/api/help', (_req, res) => {
  res.json({
    builtIn: helpBuiltIn,
    custom: Object.entries(customHelp).map(([name, description]) => ({ name, description })),
  });
});

app.post('/api/eval', async (req, res) => {
  const { expression, context } = req.body || {};
  if (typeof expression !== 'string' || expression.trim() === '') {
    return res.status(400).json({ error: 'expression es requerida y debe ser un string no vacío' });
  }
  const ctx = typeof context === 'object' && context !== null ? context : {};
  const jexl = createDomainJexl();
  try {
    jexl.createExpression(expression).compile();
  } catch (err) {
    return res.status(400).json({ error: 'Expresión inválida', detail: err.message });
  }
  let result;
  let astTraceData;
  let functionTraceData;
  try {
    const runtime = createFunctionTraceRuntime({ functions: domainFunctions });
    functionTraceData = await runtime.evalWithTrace(expression, ctx);
    result = functionTraceData.result;
  } catch (err) {
    return res.status(422).json({
      error: 'Error al evaluar',
      detail: err.message,
    });
  }
  try {
    astTraceData = await traceExpression({ jexl, expression, context: ctx });
  } catch (err) {
    return res.status(422).json({
      error: 'Error al generar trace AST',
      detail: err.message,
      partial: { functionTrace: functionTraceData },
    });
  }
  const namedSteps = {
    finalStep: 'resultado',
    result,
    evaluationOrder: ['resultado'],
    steps: [{ step: 'resultado', expression, dependsOn: [], value: result }],
    stepLabels: { resultado: 'Resultado' },
  };
  res.json({
    astTrace: astTraceData,
    functionTrace: functionTraceData,
    namedSteps,
  });
});

app.use(express.static(path.join(__dirname, 'ui')));

app.listen(PORT, () => {
  console.log(`JEXL Origin POC en http://localhost:${PORT}`);
  if (!POC_PASSWORD) console.warn('POC_PASSWORD no definida: el login fallará hasta configurarla.');
});
