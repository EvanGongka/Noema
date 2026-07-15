export function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();
  return normalized === '::1' || normalized === '0.0.0.0' || normalized.startsWith('10.') || normalized.startsWith('127.') || normalized.startsWith('169.254.') || normalized.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
}
