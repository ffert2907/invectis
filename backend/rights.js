export const ACCOUNT_RIGHTS = {
  individual: [
    'REGISTER',
    'VECTOR_TRANSACTION',
    'SETDAILYBONUS',
    'GETRATERATIO',
    'ASK_VALIDATION_ACCOUNT'
  ],
  standard: [
    'VECTOR_TRANSACTION',
    'SETDAILYBONUS',
    'GETRATERATIO',
    'ASK_VALIDATION_ACCOUNT'
  ],
  enterprise: [
    'VECTOR_TRANSACTION',
    'ASK_VALIDATION_ACCOUNT'
  ],
  institution: [
    'VECTOR_TRANSACTION',
    'ASK_VALIDATION_ACCOUNT',
    'INFORMATION'
  ],
  administration: [
    'INFORMATION',
    'POLL_QUESTION',
    'SETRATERATIO'
  ]
};
