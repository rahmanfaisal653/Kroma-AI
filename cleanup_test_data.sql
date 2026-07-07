-- Cleanup test data from kroma_ai_gateway database
-- This script removes all test users and their related data

USE kroma_ai_gateway;

-- Start transaction for safety
START TRANSACTION;

-- 1. Delete transactions from test users
DELETE t FROM transactions t
INNER JOIN users u ON t.user_id = u.id
WHERE u.email LIKE '%@example.test' 
   OR u.email LIKE 'api-%' 
   OR u.email LIKE 'ui-%';

-- 2. Delete credit_ledger entries from test users
DELETE cl FROM credit_ledger cl
INNER JOIN users u ON cl.user_id = u.id
WHERE u.email LIKE '%@example.test' 
   OR u.email LIKE 'api-%' 
   OR u.email LIKE 'ui-%';

-- 3. Delete usage_logs from test users
DELETE ul FROM usage_logs ul
INNER JOIN users u ON ul.user_id = u.id
WHERE u.email LIKE '%@example.test' 
   OR u.email LIKE 'api-%' 
   OR u.email LIKE 'ui-%';

-- 4. Delete api_keys from test users
DELETE ak FROM api_keys ak
INNER JOIN users u ON ak.user_id = u.id
WHERE u.email LIKE '%@example.test' 
   OR u.email LIKE 'api-%' 
   OR u.email LIKE 'ui-%';

-- 5. Delete feedback from test users
DELETE f FROM feedback f
INNER JOIN users u ON f.user_id = u.id
WHERE u.email LIKE '%@example.test' 
   OR u.email LIKE 'api-%' 
   OR u.email LIKE 'ui-%';

-- 6. Finally delete test users
DELETE FROM users 
WHERE email LIKE '%@example.test' 
   OR email LIKE 'api-%' 
   OR email LIKE 'ui-%';

-- Commit transaction
COMMIT;

-- Show remaining users
SELECT id, email, role, status FROM users ORDER BY id;
