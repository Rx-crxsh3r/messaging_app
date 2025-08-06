-- Seed data for messaging_app database
-- Run this script to populate the database with test users

USE messaging_app;

-- Clear existing data (optional)
-- DELETE FROM messages;
-- DELETE FROM users;

-- Insert test users
INSERT INTO users (id, username, avatar, status, created_at) VALUES
(1, 'alice_wonder', '🦄', 'Online', NOW()),
(2, 'bob_builder', '🔨', 'Online', NOW()),
(3, 'charlie_cat', '🐱', 'Away', NOW()),
(4, 'diana_dragon', '🐉', 'Offline', NOW())
ON DUPLICATE KEY UPDATE 
    username = VALUES(username),
    avatar = VALUES(avatar),
    status = VALUES(status);

-- Insert some sample messages
INSERT INTO messages (sender_id, receiver_id, content, timestamp) VALUES
(1, 2, 'Hey Bob! How are you doing?', NOW() - INTERVAL 1 HOUR),
(2, 1, 'Hi Alice! I''m doing great, thanks for asking!', NOW() - INTERVAL 55 MINUTE),
(1, 2, 'That''s awesome! Want to chat more later?', NOW() - INTERVAL 50 MINUTE),
(3, 1, 'Hi Alice! Charlie here 🐱', NOW() - INTERVAL 30 MINUTE),
(1, 3, 'Hey Charlie! Nice to see you online!', NOW() - INTERVAL 25 MINUTE)
ON DUPLICATE KEY UPDATE content = VALUES(content);

SELECT 'Seed data inserted successfully!' as message;
SELECT COUNT(*) as user_count FROM users;
SELECT COUNT(*) as message_count FROM messages;
