/** Verified against issuer links, Morpho asset addresses and Curve coin registry. */
export const INFRASTRUCTURE = {
  chainId: 42161,
  issuerSource: 'https://stablecoins.twin.finance/',
  ARGt: { token: '0x59863989d080B22476DB95656d0C3CC18be92214', vault: '0x9Dd3F844747AB78d616BF76DB92756E17A064aDD', pool: '0x356D349dA9ADd7Efb56a35fAB939A2c6D852f853', merklOpportunity: '11859569989119475260' },
  BRAt: { token: '0xC4ed6Aba5373D78E160F4df39e011F078Be54df8', vault: '0x207396cBE2F6f50670EaA69584c9f723924C7Fe9', pool: '0xEef48Df5F1c509cD9730774b4e8A4464626ef8D5', merklOpportunity: '11638794514051721299' },
  intermediateToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
} as const;
