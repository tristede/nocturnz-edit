export const EDIT_PLAN_VERSION = 1;

export function createEditPlan({ projectId, sequenceId, timebase, operations = [] }) {
  if (!projectId || !sequenceId || !timebase?.numerator || !timebase?.denominator) {
    throw new TypeError('Projet, séquence et cadence sont requis.');
  }
  return {
    schemaVersion: EDIT_PLAN_VERSION,
    projectId,
    sequenceId,
    timebase,
    operations: operations.map((operation, index) => ({
      id: operation.id ?? `op-${index + 1}`,
      status: operation.status ?? 'proposed',
      sourceRange: operation.sourceRange ?? null,
      sequenceRange: operation.sequenceRange ?? null,
      ...operation,
    })),
  };
}

export function validateEditPlan(plan) {
  const errors = [];
  if (plan?.schemaVersion !== EDIT_PLAN_VERSION) errors.push('Version de plan non prise en charge.');
  if (!plan?.projectId || !plan?.sequenceId) errors.push('Projet ou séquence manquant.');
  if (!Array.isArray(plan?.operations)) errors.push('Liste d’opérations invalide.');
  for (const operation of plan?.operations ?? []) {
    if (!['proposed', 'accepted', 'rejected', 'applied', 'failed'].includes(operation.status)) {
      errors.push(`État invalide pour ${operation.id}.`);
    }
  }
  return errors;
}
