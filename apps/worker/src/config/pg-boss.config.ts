export const PDF_QUEUE_NAME='authorization-pdf-final';
export const PDF_FINALIZED_QUEUE_NAME='authorization-pdf-finalized';
export const PDF_JOB_POLICY={retryLimit:3,retryDelay:5,retryBackoff:true,expireInSeconds:45,retentionSeconds:86400,deleteAfterSeconds:604800} as const;
export const PDF_SINGLETON_SECONDS=7*24*60*60;
