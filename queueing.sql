SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

CREATE TABLE queueing_queue_items (
	id INT NOT NULL AUTO_INCREMENT, 
	queue_no INT, 
	client_name VARCHAR(255), 
	purpose VARCHAR(255), 
	status VARCHAR(10), 
	division VARCHAR(7), 
	priority VARCHAR(7), 
	created_at DATETIME(6), 
	completed_at DATETIME(6), 
	skip_count INT DEFAULT '0' NOT NULL, 
	PRIMARY KEY (id)
);

INSERT INTO queueing_queue_items VALUES(1,1,'hi','hi','COMPLETED','CASHIER','regular','2026-07-02 10:03:56.114456','2026-07-02 11:25:18.918342',0);
INSERT INTO queueing_queue_items VALUES(2,2,'hello','hello','PENDING','CASHIER','senior','2026-07-02 10:04:02.360585',NULL,1);
INSERT INTO queueing_queue_items VALUES(3,3,'Manny','money','CANCELLED','CASHIER','regular','2026-07-02 11:25:04.607695','2026-07-02 11:25:09.172201',0);

CREATE TABLE queueing_users (
	id INT NOT NULL AUTO_INCREMENT, 
	email VARCHAR(255), 
	name VARCHAR(255), 
	password VARCHAR(255), 
	division VARCHAR(7), 
	created_at DATETIME(6), 
	last_seen DATETIME(6), 
	PRIMARY KEY (id)
);

INSERT INTO queueing_users VALUES(1,'operator@email.com','PACD','$2b$12$9lhytjDRTG6uIPYKksLr7e5GxH1rTA77oGaMf6yJrNEEv0j.olFnW','LOBBY','2026-07-06 13:29:12.403343',NULL);
INSERT INTO queueing_users VALUES(2,'sadmin@email.com','Super Admin','$2b$12$.f.bZLPgPimsapHQvQ/aguxJYliF1BvpfJwQGg/Q/bD9t7vFl3v0C','SADMIN','2026-07-06 13:29:12.403347',NULL);
INSERT INTO queueing_users VALUES(3,'smd@email.com','SMD','$2b$12$3/xyTkoy9Y2LVCMh31eVqOr1JXzOQPKUhZTFX3xbmLBP/HFaGVC7K','SMD','2026-07-06 13:29:12.403348',NULL);
INSERT INTO queueing_users VALUES(4,'lpdd@email.com','LPDD','$2b$12$eyNEz27wWsOYGIob6Xetj.RfdRiyk28m3JEKmm8G7IWKn0mPypbHK','LPDD','2026-07-06 13:29:12.403348',NULL);

CREATE INDEX ix_queueing_queue_items_queue_no ON queueing_queue_items (queue_no);
CREATE INDEX ix_queueing_queue_items_id ON queueing_queue_items (id);
CREATE INDEX ix_queueing_queue_items_client_name ON queueing_queue_items (client_name);
CREATE INDEX ix_queueing_users_id ON queueing_users (id);
CREATE UNIQUE INDEX ix_queueing_users_email ON queueing_users (email);

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
