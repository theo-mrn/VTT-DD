import Script from 'next/script';

const NREUM_LOADER = 'https://js-agent.newrelic.com/nr-loader-spa-1.323.0.min.js';

/**
 * Agent navigateur New Relic (RUM, erreurs JS, session replay). Configuration copiée du snippet
 * New Relic ; le chargeur SPA vient de leur CDN plutôt que d'être collé en entier dans la page.
 * Builds de production, sur yner.fr seulement : application distincte pour staging et prod,
 * rien ailleurs (localhost, tests de bout en bout de la CI).
 */
const NREUM_CONFIG = `;(function(){var h=location.hostname;var nrApp=/(^|\\.)(staging|preview)\\.yner\\.fr$/.test(h)?"538913404":/(^|\\.)yner\\.fr$/.test(h)?"538913172":null;if(!nrApp)return;window.NREUM||(NREUM={});NREUM.init={browser_consent_mode:{enabled:false},privacy:{cookies_enabled:true},session_replay:{enabled:true,block_selector:'',mask_text_selector:'*',sampling_rate:5.0,error_sampling_rate:100.0,mask_all_inputs:true,collect_fonts:true,inline_images:false,inline_stylesheet:true,fix_stylesheets:true,preload:false,mask_input_options:{}},distributed_tracing:{enabled:true,cors_use_newrelic_header:false,cors_use_tracecontext_headers:true,allowed_origins:['https://api.yner.fr','https://api.staging.yner.fr']},performance:{capture_measures:true},ajax:{deny_list:["bam.eu01.nr-data.net"],capture_payloads:'none'}};
;NREUM.loader_config={accountID:"8603324",trustKey:"8603324",agentID:nrApp,licenseKey:"NRJS-4050001c54e578b691e",applicationID:nrApp};
;NREUM.info={beacon:"bam.eu01.nr-data.net",errorBeacon:"bam.eu01.nr-data.net",licenseKey:"NRJS-4050001c54e578b691e",applicationID:nrApp,sa:1};
;var s=document.createElement('script');s.src='${NREUM_LOADER}';s.crossOrigin='anonymous';document.head.appendChild(s)})();`;

export function NewRelic() {
  if (process.env.NODE_ENV !== 'production') return null;
  return (
    <Script id="nr-config" strategy="beforeInteractive">
      {NREUM_CONFIG}
    </Script>
  );
}
