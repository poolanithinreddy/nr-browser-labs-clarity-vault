// URL utilities — tracking parameter removal.
// Expands the removal list beyond the original minimal set.

const TRACKING_PARAMS = new Set([
  // Google Analytics / Ads
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_name',
  'gclid', 'gclsrc', 'gad_source', 'dclid',
  // Facebook / Meta
  'fbclid', 'fb_action_ids', 'fb_action_types', 'fb_ref', 'fb_source',
  // Twitter / X
  'twclid',
  // Microsoft Bing
  'msclkid',
  // Mailchimp
  'mc_cid', 'mc_eid',
  // HubSpot
  'hsa_acc', 'hsa_cam', 'hsa_grp', 'hsa_ad', 'hsa_src',
  'hsa_tgt', 'hsa_kw', 'hsa_mt', 'hsa_net', 'hsa_ver',
  // LinkedIn
  'li_fat_id',
  // Pinterest
  'epik',
  // Marketo
  'mkt_tok',
  // Vero
  'vero_conv', 'vero_id',
  // Generic click / referral IDs
  'ClickID', 'clickid', 'click_id',
  'aff_id', 'affiliate', 'affiliate_id',
  'ref', 'ref_src', 'referrer',
  // Sailthru
  'sailthru_mid',
  // Drip
  '__s',
  // ActiveCampaign
  'vgo_ee',
  // Yahoo
  'yclid',
  // Adobe / Omniture
  'sc_campaign', 'sc_channel', 'sc_content', 'sc_medium', 'sc_outcome', 'sc_geo', 'sc_country',
  // Miscellaneous
  'igshid', 'trk', 'trkCampaign', 'sid',
]);

/**
 * Strips known tracking query parameters from a URL string.
 * Returns the original string unchanged if parsing fails.
 * @param {string} url
 * @returns {string}
 */
export function cleanUrlTracking(url) {
  try {
    const u = new URL(url);
    let removed = 0;
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key)) {
        u.searchParams.delete(key);
        removed++;
      }
    }
    return removed > 0 ? u.toString() : url;
  } catch {
    return url;
  }
}
