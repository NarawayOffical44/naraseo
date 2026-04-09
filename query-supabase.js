import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mmbcgtlgimbaeczotymr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tYmNndGxnaW1iYWVjem90eW1yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzY4MTc4MywiZXhwIjoyMDg5MjU3NzgzfQ.LO50ZWhqZ4Qkwr3BvAc-dn0bnItM_xu2B7v7sVoUuUM'
);

async function queryAllData() {
  console.log('📊 QUERYING SUPABASE DATABASE...\n');

  // 1. Query users
  console.log('=== USERS ===');
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('*');
  if (userError) {
    console.log('❌ Error:', userError.message);
  } else {
    console.log(`✅ Found ${users?.length || 0} users`);
    users?.forEach(u => console.log(`  - ${u.email} (ID: ${u.id})`));
  }

  // 2. Query profiles
  console.log('\n=== PROFILES ===');
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('*');
  if (profileError) {
    console.log('❌ Error:', profileError.message);
  } else {
    console.log(`✅ Found ${profiles?.length || 0} profiles`);
    profiles?.forEach(p => console.log(`  - Plan: ${p.plan}, Credits: ${p.credits}, Reset Month: ${p.reset_month}`));
  }

  // 3. Query API keys
  console.log('\n=== API KEYS ===');
  const { data: apiKeys, error: apiKeyError } = await supabase
    .from('api_keys')
    .select('*');
  if (apiKeyError) {
    console.log('❌ Error:', apiKeyError.message);
  } else {
    console.log(`✅ Found ${apiKeys?.length || 0} API keys`);
    apiKeys?.forEach(k => console.log(`  - User: ${k.user_id}, Tier: ${k.tier}, Active: ${k.active}`));
  }

  // 4. Query payment history
  console.log('\n=== PAYMENT HISTORY ===');
  const { data: payments, error: paymentError } = await supabase
    .from('payment_history')
    .select('*');
  if (paymentError) {
    console.log('❌ Error:', paymentError.message);
  } else {
    console.log(`✅ Found ${payments?.length || 0} payments`);
    payments?.forEach(p => console.log(`  - User: ${p.user_id}, Plan: ${p.plan}, Amount: ${p.amount}, Status: ${p.status}`));
  }

  // 5. Query auth users (from auth.users table)
  console.log('\n=== AUTH USERS ===');
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.log('❌ Error:', authError.message);
  } else {
    console.log(`✅ Found ${authUsers?.users?.length || 0} authenticated users`);
    authUsers?.users?.forEach(u => console.log(`  - ${u.email} (ID: ${u.id}, Last login: ${u.last_sign_in_at})`));
  }

  console.log('\n✨ QUERY COMPLETE');
}

queryAllData().catch(console.error);
