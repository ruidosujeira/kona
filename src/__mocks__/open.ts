// Mock for 'open' package (ESM-only)
const open = async (target: string, options?: any) => {
  // No-op in tests
  return { pid: 0 } as any;
};

export default open;
module.exports = open;
module.exports.default = open;
