import Script from 'next/script';

/**
 * Agent navigateur New Relic (RUM, erreurs JS, session replay). Configuration copiée du snippet
 * New Relic ; le chargeur SPA vient de leur CDN plutôt que d'être collé en entier dans la page.
 * Builds de production seulement (staging et prod) : rien en dev.
 */
const NREUM_CONFIG = `;window.NREUM||(NREUM={});NREUM.init={browser_consent_mode:{enabled:false},privacy:{cookies_enabled:true},session_replay:{enabled:true,block_selector:'',mask_text_selector:'*',sampling_rate:5.0,error_sampling_rate:100.0,mask_all_inputs:true,collect_fonts:true,inline_images:false,inline_stylesheet:true,fix_stylesheets:true,preload:false,mask_input_options:{}},distributed_tracing:{enabled:true},performance:{capture_measures:true},ajax:{deny_list:["bam.eu01.nr-data.net"],capture_payloads:'none'}};
;NREUM.loader_config={accountID:"8603324",trustKey:"8603324",agentID:"538913172",licenseKey:"NRJS-4050001c54e578b691e",applicationID:"538913172"};
;NREUM.info={beacon:"bam.eu01.nr-data.net",errorBeacon:"bam.eu01.nr-data.net",licenseKey:"NRJS-4050001c54e578b691e",applicationID:"538913172",sa:1};`;

const NREUM_LOADER = 'https://js-agent.newrelic.com/nr-loader-spa-1.323.0.min.js';

export function NewRelic() {
  if (process.env.NODE_ENV !== 'production') return null;
  return (
    <>
      <Script id="nr-config" strategy="beforeInteractive">
        {NREUM_CONFIG}
      </Script>
      <Script
        id="nr-loader"
        src={NREUM_LOADER}
        strategy="beforeInteractive"
        crossOrigin="anonymous"
      />
    </>
  );
}
