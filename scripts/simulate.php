<?php
declare(strict_types=1);
require dirname(__DIR__).'/app/bootstrap.php';
require dirname(__DIR__).'/tests/fixture.php';
try {
    $config=BinarioZero\configuration(); $action=$argv[1]??'create';
    if(!in_array($action,['create','update','exclude','tomorrow'],true)) throw new RuntimeException('Invalid action');
    $base=getenv('SIMULATOR_BASE_URL')?:'http://127.0.0.1:8080'; $url=parse_url($base);
    $local=in_array($url['host']??'', ['localhost','127.0.0.1','::1','[::1]'],true);
    if(!$local&&(!in_array('--allow-remote',$argv,true)||($url['scheme']??'')!=='https')) throw new RuntimeException('Remote tests require HTTPS and --allow-remote');
    if(strlen($config['WEBHOOK_URL_TOKEN'])<32||$config['BRM_NAMESPACE']==='') throw new RuntimeException('Missing configuration');
    $now=new DateTimeImmutable('now',new DateTimeZone($config['BRM_TIME_ZONE'])); $f=fixture();
    $f['namespace']=$config['BRM_NAMESPACE']; $f['reference']=$f['data']['reference']='BOARD-SIM-'.$now->format('Y-m-d');
    $f['event']=$action==='create'?'reservation.create':'reservation.update';
    $f['data']['start_date']=($action==='tomorrow'?$now->modify('+1 day'):$now)->format('Y-m-d');
    $f['data']['start_time']=$action==='update'?'11:45':'09:30';
    $f['data']['created_ts']=$now->setTime(0,0)->getTimestamp()*1000; $f['data']['updated_ts']=(int)floor(microtime(true)*1000);
    if($action==='exclude') $f['data']['status']='UNVERIFIED-TEST-STATE';
    $endpoint=rtrim($base,'/').'/api/webhooks/brm?key='.rawurlencode($config['WEBHOOK_URL_TOKEN']);
    $context=stream_context_create(['http'=>['method'=>'POST','header'=>"Content-Type: application/json\r\nConnection: close\r\n",'content'=>json_encode($f,JSON_THROW_ON_ERROR),'timeout'=>10,'ignore_errors'=>true]]);
    $body=@file_get_contents($endpoint,false,$context);
    if($body===false) throw new RuntimeException('Request failed');
    $result=json_decode($body,true,32,JSON_THROW_ON_ERROR);
    echo json_encode(['outcome'=>$result['outcome']??'unknown','requestId'=>$result['requestId']??null],JSON_THROW_ON_ERROR)."\n";
    if(!in_array($result['outcome']??'',['inserted','updated','duplicate','stale'],true)) exit(1);
} catch(Throwable) { fwrite(STDERR,"Simulation failed: check action, local configuration and staging server. No secrets logged.\n"); exit(1); }
