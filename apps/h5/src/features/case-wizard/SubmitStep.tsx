import { useState } from 'react';
export function SubmitStep() { const [submitted, setSubmitted] = useState(false); return <section><h1>Submit</h1>{submitted ? <p>Submitted</p> : <><p>Confirm the authorization statement before submitting.</p><button type="button" onClick={() => setSubmitted(true)}>Submit application</button></>}</section>; }
