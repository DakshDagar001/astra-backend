export type ResponseMode = 'FULL_EXPLANATION' | 'ANSWER_ONLY';

export const RESPONSE_MODE_INSTRUCTIONS: Record<ResponseMode, string> = {
  FULL_EXPLANATION: `You are in FULL EXPLANATION mode.
Provide a complete, step-by-step solution.
- Include relevant formulas, substitution of values, and intermediate calculations.
- Provide clear logical explanations for concepts and decisions.
- Clearly identify the final answer with appropriate units and notation.
- For code, explain the design choices and key logic.`,

  ANSWER_ONLY: `You are in ANSWER ONLY mode.
Return ONLY the concise final answer/result.
- Do NOT provide step-by-step explanations, introductory preamble, or concluding remarks.
- Do NOT include intermediate calculations or derivations.
- State the final answer directly with units where applicable (e.g. "4 m/s²").
- Preserve mathematical and technical notation.
- Include a brief clarification only if strictly required to avoid ambiguity.`,
};

export function getSystemInstructionForMode(mode?: ResponseMode): string {
  if (mode === 'ANSWER_ONLY') {
    return RESPONSE_MODE_INSTRUCTIONS.ANSWER_ONLY;
  }
  return RESPONSE_MODE_INSTRUCTIONS.FULL_EXPLANATION;
}
