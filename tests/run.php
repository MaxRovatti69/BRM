<?php
declare(strict_types=1);
require dirname(__DIR__) . '/app/bootstrap.php';
require __DIR__ . '/fixture.php';
use BinarioZero\Application;
use BinarioZero\Normalizer;
use BinarioZero\ReservationStore;
$passed = 0;
function same(mixed $a, mixed $b): void { if ($a !== $b) throw new RuntimeException('Assertion failed: ' . var_export($a,true) . ' != ' . var_export($b,true)); }
function fails(callable $fn): void { try { $fn(); } catch (BinarioZero\PayloadError) { return; } throw new RuntimeException('Expected rejection'); }
function check(string $name, callable $fn): void { global $passed; $fn(); $passed++; echo "PASS $name\n"; }
$dir=sys_get_temp_dir().'/binario-test-'.bin2hex(random_bytes(6)); mkdir($dir,0700);
try {
check('Official payload, Italian time, products and data minimization', function() {
    $r=Normalizer::normalize(fixture(),'test-store','Europe/Rome');
    same($r['customerName'],'CLIENTE SIMULATO'); same($r['startsAt'],'2026-11-04T08:30:00.000Z');
    same($r['products'],[['name'=>'CASCO','quantity'=>1],['name'=>'E-BIKE','quantity'=>2]]);
    same(str_contains(json_encode($r),'never-store'),false); same(str_contains(json_encode($r),'DO-NOT-STORE'),false);
});
check('Unknown statuses, drafts and stages excluded without invented cancellation values', function() {
    foreach ([['status'=>'UNVERIFIED-TEST-STATE'],['draft'=>true],['stage'=>'unknown']] as $patch) {
        $f=fixture(); $f['data']=array_replace($f['data'],$patch); same(Normalizer::normalize($f,'test-store','Europe/Rome')['cancelled'],true);
    }
});
check('Invalid envelope, namespace, reference, events and timestamp rejected', function() {
    foreach ([['namespace'=>'other'],['reference'=>'other'],['event'=>'customer.create'],['data'=>[]]] as $patch) fails(fn()=>Normalizer::normalize(array_replace(fixture(),$patch),'test-store','Europe/Rome'));
    $f=fixture(); $f['event']='reservation.update'; $f['data']['updated_ts']=null; fails(fn()=>Normalizer::normalize($f,'test-store','Europe/Rome'));
});
check('Calendar dates and DST ambiguous/nonexistent times rejected', function() {
    foreach ([['2026-03-29','02:30'],['2026-10-25','02:30'],['2026-02-30','09:00']] as [$date,$time]) {
        $f=fixture(); $f['data']['start_date']=$date; $f['data']['start_time']=$time;
        fails(fn()=>Normalizer::normalize($f,'test-store','Europe/Rome'));
    }
});
check('Persistent SQLite, duplicate delivery, stale and conflicting versions', function() use($dir) {
    $r=Normalizer::normalize(fixture(),'test-store','Europe/Rome');
    $s=new ReservationStore($dir.'/persist.sqlite'); same($s->save($r),'inserted'); same($s->save($r),'duplicate'); unset($s);
    $s=new ReservationStore($dir.'/persist.sqlite'); $now=new DateTimeImmutable('2026-11-04T12:00:00+01:00'); same(count($s->today('test-store','Europe/Rome',$now)),1);
    $changed=$r; $changed['sourceUpdatedAt']+=1000; $changed['customerName']='NUOVO CLIENTE'; same($s->save($changed),'updated'); same($s->save($r),'stale');
    $conflict=$changed; $conflict['customerName']='CONFLITTO'; same($s->save($conflict),'conflict');
    $changed['sourceUpdatedAt']+=1000; same($s->save($changed),'duplicate');
    $changed['sourceUpdatedAt']+=1000; $changed['cancelled']=true; same($s->save($changed),'updated'); same(count($s->today('test-store','Europe/Rome',$now)),0);
});
check('Existing SQLite snapshots survive hash/order differences on migration', function() use($dir) {
    $path=$dir.'/migration.sqlite'; $r=Normalizer::normalize(fixture(),'test-store','Europe/Rome');
    $store=new ReservationStore($path); $store->save($r);
    $pdo=new PDO('sqlite:'.$path);
    $query=$pdo->prepare('UPDATE reservations SET content_hash=?,products_json=?');
    $query->execute(['previous-backend-hash',json_encode(array_reverse($r['products']))]);
    same($store->save($r),'duplicate');
    same(count($store->today('test-store','Europe/Rome',new DateTimeImmutable('2026-11-04T12:00:00+01:00'))),1);
});
check('Local day bounds and namespace isolation', function() {
    foreach (['2026-03-29','2026-10-25'] as $date) {
        $s=new ReservationStore(':memory:'); $f=fixture(); $f['data']['start_date']=$date; $f['data']['start_time']='23:59'; $r=Normalizer::normalize($f,'test-store','Europe/Rome'); $s->save($r);
        $now=new DateTimeImmutable($date.'T12:00:00',new DateTimeZone('Europe/Rome')); same(count($s->today('test-store','Europe/Rome',$now)),1);
        same(count($s->today('other-store','Europe/Rome',$now)),0); same(count($s->today('test-store','Europe/Rome',$now->modify('+1 day'))),0);
    }
});
check('PHP handlers: authentication, limits, updates, day filter and private logs', function() use($dir) {
    $c=['BOARD_MODE'=>'live','BOARD_USERNAME'=>'board','BOARD_PASSWORD'=>str_repeat('p',32),'BRM_NAMESPACE'=>'test-store','WEBHOOK_URL_TOKEN'=>str_repeat('a',64),'BRM_TIME_ZONE'=>'Europe/Rome','DATABASE_PATH'=>$dir.'/http.sqlite','WEBHOOK_LOG_PATH'=>$dir.'/webhooks.log'];
    $app=new Application($c); $headers=['content-type'=>'application/json']; $query=['key'=>$c['WEBHOOK_URL_TOKEN']];
    $send=fn($f)=>$app->handle('POST','/api/webhooks/brm',$headers,json_encode($f),$query);
    same($app->handle('POST','/api/webhooks/brm',$headers,'{}',[])->status,401);
    same($app->handle('POST','/api/webhooks/brm',['content-type'=>'text/plain'],'{}',$query)->status,415);
    same($app->handle('POST','/api/webhooks/brm',$headers,'{',$query)->status,400);
    same($app->handle('POST','/api/webhooks/brm',$headers,str_repeat('x',262145),$query)->status,413);
    same($app->handle('GET','/api/webhooks/brm')->status,405); same($app->handle('GET','/api/board')->status,401); same($app->handle('GET','/board')->status,401);
    $auth=['authorization'=>'Basic '.base64_encode('board:'.$c['BOARD_PASSWORD'])];
    $f=fixture(); $f['data']['start_date']=(new DateTimeImmutable('now',new DateTimeZone('Europe/Rome')))->format('Y-m-d');
    same(json_decode($send($f)->body,true)['outcome'],'inserted'); same(json_decode($send($f)->body,true)['outcome'],'duplicate');
    $board=fn()=>json_decode($app->handle('GET','/api/board',$auth)->body,true);
    same(count($board()['reservations']),1);
    $f['event']='reservation.update'; $f['data']['updated_ts']+=1000; $f['data']['start_time']='11:45'; same($send($f)->status,200); same($board()['reservations'][0]['time'],'11:45');
    $f['data']['updated_ts']+=1000; $f['data']['status']='UNVERIFIED-TEST-STATE'; same($send($f)->status,200); same(count($board()['reservations']),0);
    $f['data']['updated_ts']+=1000; $f['data']['status']='ok'; $f['data']['start_date']='2020-01-01'; same($send($f)->status,200); same(count($board()['reservations']),0);
    $log=file_get_contents($c['WEBHOOK_LOG_PATH']); foreach (['TEST-001','SIMULATO','test-store','never-store',str_repeat('a',64)] as $private) same(str_contains($log,$private),false);
    $c['WEBHOOK_URL_TOKEN']=''; same((new Application($c))->handle('POST','/api/webhooks/brm',$headers,'{}',$query)->status,503);
});
check('Demo/live separation, health, redirect and nonpublic paths', function() {
    $app=new Application(['BOARD_MODE'=>'demo','BRM_TIME_ZONE'=>'Europe/Rome']);
    same(count(json_decode($app->handle('GET','/api/board')->body,true)['reservations']),8);
    same($app->handle('GET','/board')->status,200); same($app->handle('GET','/api/health')->status,200); same($app->handle('GET','/')->status,302); same($app->handle('GET','/data/db.sqlite')->status,404);
});
check('Editable texts preserve Unicode and cannot inject scripts or HTML', function() {
    $texts=require dirname(__DIR__).'/config/texts.php';
    $custom="L'avventura è qui </script><script>alert(1)</script>";
    $texts['titolo']=$custom; $texts['titolo_scheda']=$custom;
    $texts['descrizione_scheda']='" onload="alert(1)';
    $html=BinarioZero\renderBoard($texts);
    same(str_contains($html,'<script>alert(1)</script>'),false);
    same(str_contains($html,'<title>'.htmlspecialchars($custom,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8').'</title>'),true);
    preg_match('~<script id="board-texts" type="application/json">(.*?)</script>~s',$html,$match);
    same(json_decode($match[1],true,32,JSON_THROW_ON_ERROR)['titolo'],$custom);
    same(str_contains($html,'content="&quot; onload=&quot;alert(1)"'),true);
});
echo "$passed tests passed\n";
} finally { foreach (glob($dir.'/*') as $file) unlink($file); rmdir($dir); }
