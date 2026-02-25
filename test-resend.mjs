import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const resend = new Resend(process.env.RESEND_API_KEY);
const audienceId = process.env.RESEND_AUDIANCE_KEY;

async function run() {
  console.log('creating...');
  const res1 = await resend.contacts.create({
    email: 'test@example.com',
    firstName: 'Test',
    unsubscribed: false,
    audienceId,
  });
  console.log(res1);

  console.log('removing by email...?');
  const res2 = await resend.contacts.remove({
    email: 'test@example.com',
    audienceId,
  });
  console.log(res2);
}
run();
