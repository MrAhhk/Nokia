export const initialPairingFlow = { stage: 'list', role: 'owner', label: '', payload: '', pendingId: null, fingerprint: '', acknowledged: false, code: '', outbound: '', qr: '', detail: null };
export function pairingFlowReducer(state, action) {
  if (action.type === 'OPEN') return { ...initialPairingFlow, role: action.role };
  if (action.type === 'RESET') return { ...initialPairingFlow, role: state.role };
  if (action.type === 'PATCH') return { ...state, ...action.value };
  if (action.type === 'DETAIL') return { ...state, stage: 'detail', detail: action.value };
  return state;
}
export const numericFriendCode = value => String(value).replace(/\s/g, '');
