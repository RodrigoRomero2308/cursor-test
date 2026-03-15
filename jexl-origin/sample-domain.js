const { Jexl } = require('jexl');

const sampleContext = {
  user: {
    age: 42,
    monthlyIncome: 7500,
    country: 'AR',
  },
  threshold: 10,
  manualAdjustment: 1,
  candidates: [
    { id: 'a', active: true, points: 4 },
    { id: 'b', active: false, points: 9 },
    { id: 'c', active: true, points: 3 },
  ],
};

const domainFunctions = {
  ageScore(age) {
    if (age >= 45) return 5;
    if (age >= 35) return 4;
    if (age >= 25) return 3;
    return 1;
  },

  incomeScore(monthlyIncome) {
    if (monthlyIncome >= 9000) return 5;
    if (monthlyIncome >= 7000) return 4;
    if (monthlyIncome >= 5000) return 3;
    return 1;
  },

  sumPoints(items = []) {
    return items.reduce((total, item) => total + (item.points || 0), 0);
  },

  applyAdjustment(base, adjustment) {
    return base + adjustment;
  },

  segmentLabel(country) {
    return country === 'AR' ? 'perfil-local' : 'perfil-global';
  },
};

function createDomainJexl() {
  const jexl = new Jexl();
  jexl.addFunctions(domainFunctions);
  return jexl;
}

module.exports = {
  sampleContext,
  domainFunctions,
  createDomainJexl,
};
