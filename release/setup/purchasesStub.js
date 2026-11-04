// RevenueCat's SDK is native-only. Entitlement checks read the database
// (users.full_access_override, trip_passes, subscription_windows, cap RPCs), so
// release tests only need the SDK calls made at startup and sign-in to resolve.
const Purchases = {
  configure: () => {},
  logIn: async () => ({}),
  logOut: async () => ({}),
  setAttributes: async () => {},
  getProducts: async () => [],
  purchaseStoreProduct: async () => { throw new Error('Purchases are not available in release tests'); },
  restorePurchases: async () => ({}),
};

module.exports = Purchases;
module.exports.default = Purchases;
