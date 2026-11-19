-- Reversão: volta ao valor gravado pelo "Encerrar todas".
begin;
update public.propostas set expira_em = '2026-11-19 12:40:36.279217+00' where id = 'ba3201e0-a76f-4e09-b184-34bcd694b8ab';
update public.propostas set expira_em = '2026-11-19 15:57:58.420612+00'
 where id in ('9c95a1ce-5604-47b0-84af-c4c42f7b36a7','c5b1a154-c6cf-4400-a87d-1b5fe2ca2d6b','6b924fb8-ceaf-4eb9-846a-a390e2bc3edd',
              'd6b4a080-03fc-4f82-9c7d-e47f4fec13ef','e8bc2ccc-b763-44dd-be63-d8f56b4cb0e7','4a3362be-52eb-4347-944a-14ef18479f55','9f1709b5-9d5e-456d-b67d-a529fb9497fc');
commit;
