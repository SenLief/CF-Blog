ALTER TABLE site_settings
  ADD COLUMN memo_description TEXT NOT NULL
  DEFAULT '一些轻量、即时，不必展开成长文的记录。';

UPDATE site_settings
SET author_name = title
WHERE trim(author_name) = '' OR author_name = '作者';
