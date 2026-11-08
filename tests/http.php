<?php
declare(strict_types=1);
require __DIR__.'/fixture.php';
function verify(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
$dir=sys_get_temp_dir().'/binario-http-'.bin2hex(random_bytes(6));mkdir($dir,0700);
$probe=stream_socket_server('tcp://127.0.0.1:0',$errno,$error);$port=(int)substr(strrchr(stream_socket_get_name($probe,false),':'),1);fclose($probe);
$token=bin2hex(random_bytes(32));$password=bin2hex(random_bytes(24));
foreach(['BOARD_MODE'=>'live','BOARD_USERNAME'=>'board','BOARD_PASSWORD'=>$password,'BRM_NAMESPACE'=>'test-store','WEBHOOK_URL_TOKEN'=>$token,'BRM_TIME_ZONE'=>'Europe/Rome','DATABASE_PATH'=>$dir.'/database.sqlite','WEBHOOK_LOG_PATH'=>$dir.'/audit.log']as$key=>$value)putenv($key.'='.$value);
$php=getenv('PHP_BIN')?:PHP_BINARY;
$command=[$php,'-S','127.0.0.1:'.$port,'-t',dirname(__DIR__).'/public',dirname(__DIR__).'/router.php'];
$start=function()use($command,$dir){$process=proc_open($command,[0=>['file','/dev/null','r'],1=>['file',$dir.'/server.log','a'],2=>['file',$dir.'/server.log','a']],$pipes,dirname(__DIR__));return $process;};
$request=function(string $path,string $method='GET',string $body='',array $headers=[])use($port):array{
    $context=stream_context_create(['http'=>['method'=>$method,'header'=>implode("\r\n",array_merge(['Connection: close'],$headers)),'content'=>$body,'timeout'=>3,'ignore_errors'=>true]]);
    $text=@file_get_contents('http://127.0.0.1:'.$port.$path,false,$context);
    $status=isset($http_response_header[0])?(int)explode(' ',$http_response_header[0])[1]:0;
    return ['status'=>$status,'body'=>$text===false?'':$text];
};
$ready=function()use($request){for($i=0;$i<50;$i++){if($request('/api/health')['status']===200)return;usleep(100000);}throw new RuntimeException('PHP server did not start');};
$process=$start();
try{
    $ready();$auth=['Authorization: Basic '.base64_encode('board:'.$password)];
    verify($request('/board')['status']===401,'Live board must require credentials');
    verify($request('/api/board')['status']===401,'Live API must require credentials');
    verify($request('/board','GET','',$auth)['status']===200,'Authorized board did not load');
    verify($request('/assets/vendor/react.production.min.js')['status']===200,'React asset not served');
    verify($request('/assets/binario-zero.png')['status']===200,'Logo asset not served');
    verify($request('/config/local.php')['status']===404,'Private configuration is exposed');
    verify($request('/data/reservations.sqlite')['status']===404,'Database is exposed');
    $f=fixture();$f['data']['start_date']=(new DateTimeImmutable('now',new DateTimeZone('Europe/Rome')))->format('Y-m-d');
    $send=fn($value)=>$request('/api/webhooks/brm?key='.$token,'POST',json_encode($value,JSON_THROW_ON_ERROR),['Content-Type: application/json']);
    verify($request('/api/webhooks/brm?key=wrong','POST','{}',['Content-Type: application/json'])['status']===401,'Invalid token accepted');
    verify(json_decode($send($f)['body'],true)['outcome']==='inserted','Webhook was not persisted');
    verify(json_decode($send($f)['body'],true)['outcome']==='duplicate','Retry created duplicate');
    $board=fn()=>json_decode($request('/api/board','GET','',$auth)['body'],true,32,JSON_THROW_ON_ERROR);
    verify(count($board()['reservations'])===1&&count($board()['reservations'][0]['products'])===2,'Multi-product reservation missing');
    $f['event']='reservation.update';$f['data']['updated_ts']+=1000;$f['data']['start_time']='11:45';verify($send($f)['status']===200,'Update rejected');
    verify($board()['reservations'][0]['time']==='11:45','Updated time missing');
    proc_terminate($process);proc_close($process);$process=null;$process=$start();$ready();
    verify($board()['reservations'][0]['time']==='11:45','Persistence lost after restart');
    $f['data']['status']='UNVERIFIED-TEST-STATE';$f['data']['updated_ts']+=1000;verify($send($f)['status']===200,'Exclusion update rejected');verify(count($board()['reservations'])===0,'Unknown state remains visible');
    putenv('SIMULATOR_BASE_URL=http://127.0.0.1:'.$port);
    $sim=proc_open([$php,dirname(__DIR__).'/scripts/simulate.php','create'],[0=>['file','/dev/null','r'],1=>['pipe','w'],2=>['pipe','w']],$simPipes);
    $simResult=stream_get_contents($simPipes[1]); stream_get_contents($simPipes[2]); fclose($simPipes[1]); fclose($simPipes[2]);
    verify(proc_close($sim)===0,'PHP simulator failed');
    verify(in_array(json_decode($simResult,true)['outcome'],['inserted','updated'],true),'Simulator event was not saved');
    echo "PASS HTTP: PHP routing, assets, authorization, webhook create/update, duplicates, multiple products, restart persistence, exclusions, private paths and CLI simulator\n";
}finally{
    if(is_resource($process)){proc_terminate($process);proc_close($process);}
    foreach(glob($dir.'/*')as$file)unlink($file);rmdir($dir);
}
