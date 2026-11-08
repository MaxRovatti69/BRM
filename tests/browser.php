<?php
declare(strict_types=1);
// Native PHP + Chromium/CDP. No Node, Python, WebDriver or npm required.
final class Cdp {
    private $socket;
    private int $id=0;
    public array $errors=[];
    public function __construct(string $url) {
        $u=parse_url($url); $this->socket=stream_socket_client('tcp://'.$u['host'].':'.$u['port'],$errno,$message,5);
        if (!$this->socket) throw new RuntimeException('Cannot connect to Chromium');
        stream_set_timeout($this->socket,15); $key=base64_encode(random_bytes(16));
        fwrite($this->socket,"GET ".$u['path']." HTTP/1.1\r\nHost: ".$u['host'].":".$u['port']."\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: $key\r\nSec-WebSocket-Version: 13\r\n\r\n");
        $response=''; while (($line=fgets($this->socket))!==false) { $response.=$line; if ($line==="\r\n") break; }
        $expected=base64_encode(sha1($key.'258EAFA5-E914-47DA-95CA-C5AB0DC85B11',true));
        if (!str_contains($response,'101') || !str_contains($response,$expected)) throw new RuntimeException('WebSocket handshake failed');
    }
    private function read(int $length): string {
        $data=''; while(strlen($data)<$length) { $chunk=fread($this->socket,$length-strlen($data)); if($chunk===false||$chunk==='') throw new RuntimeException('Browser connection timed out'); $data.=$chunk; } return $data;
    }
    public function call(string $method,array $params=[]): array {
        $id=++$this->id; $data=json_encode(['id'=>$id,'method'=>$method,'params'=>(object)$params],JSON_THROW_ON_ERROR); $length=strlen($data); $mask=random_bytes(4);
        $header=chr(0x81).($length<126?chr(0x80|$length):($length<65536?chr(0xfe).pack('n',$length):chr(0xff).pack('NN',0,$length)));
        $masked=''; for($i=0;$i<$length;$i++) $masked.=$data[$i]^$mask[$i%4]; fwrite($this->socket,$header.$mask.$masked);
        while(true) {
            $frame=unpack('Cfirst/Csecond',$this->read(2)); $length=$frame['second']&127;
            if($length===126) $length=unpack('n',$this->read(2))[1]; elseif($length===127) { $long=unpack('Nhigh/Nlow',$this->read(8)); if($long['high']!==0) throw new RuntimeException('Oversized frame'); $length=$long['low']; }
            $payload=$this->read($length); if(($frame['first']&15)===8) throw new RuntimeException('Browser closed');
            $r=json_decode($payload,true,64,JSON_THROW_ON_ERROR);
            if(($r['method']??'')==='Runtime.exceptionThrown') $this->errors[]=$r['params']['exceptionDetails']['text']??'JS exception';
            if(($r['id']??null)!==$id) continue;
            if(isset($r['error'])) throw new RuntimeException('CDP command failed: '.$method);
            return $r['result']??[];
        }
    }
    public function evaluate(string $expression): mixed {
        $r=$this->call('Runtime.evaluate',['expression'=>$expression,'awaitPromise'=>true,'returnByValue'=>true]);
        if(isset($r['exceptionDetails'])) throw new RuntimeException('Browser assertion failed: '.($r['exceptionDetails']['exception']['description']??'JS error'));
        return $r['result']['value']??null;
    }
}
$url=$argv[1]??'http://127.0.0.1:8080/board';
if (!in_array(parse_url($url,PHP_URL_HOST),['127.0.0.1','localhost','::1'],true)) throw new RuntimeException('Browser test accepts loopback only');
$profile=sys_get_temp_dir().'/binario-chrome-'.bin2hex(random_bytes(6)); mkdir($profile,0700);
$chrome=getenv('CHROMIUM_BIN')?:'/usr/lib/chromium/chromium';
$process=proc_open([$chrome,'--headless','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='.$profile,'about:blank'],[0=>['pipe','r'],1=>['file',$profile.'/stdout','a'],2=>['file',$profile.'/stderr','a']],$pipes);
try {
    for($i=0;$i<100&&!is_file($profile.'/DevToolsActivePort');$i++) usleep(100000);
    $port=(int)trim(explode("\n",file_get_contents($profile.'/DevToolsActivePort'))[0]);
    $list=json_decode(file_get_contents('http://127.0.0.1:'.$port.'/json/list'),true,32,JSON_THROW_ON_ERROR);
    $page=array_values(array_filter($list,fn($p)=>$p['type']==='page'))[0]; $cdp=new Cdp($page['webSocketDebuggerUrl']);
    $cdp->call('Runtime.enable'); $cdp->call('Page.enable');
    $cdp->call('Emulation.setDeviceMetricsOverride',['width'=>1920,'height'=>1080,'deviceScaleFactor'=>1,'mobile'=>false]);
    $cdp->call('Page.navigate',['url'=>$url]);
    for($i=0;$i<100;$i++) { if($cdp->evaluate('Boolean(document.querySelector(".flap-text"))')) break; usleep(100000); }
    usleep(900000);
    $result=$cdp->evaluate(<<<'JS'
(() => {
 const check=(condition,message)=>{if(!condition)throw new Error(message)};
 check(document.querySelectorAll('tbody tr:has(.flap-text)').length===8,'Expected 8 demo booking rows');
 const logo=document.querySelector('.brand-logo');check(logo.complete&&logo.naturalWidth>0,'Logo did not load');
 check(document.documentElement.scrollWidth===1920,'Horizontal Full HD overflow');
 check(document.documentElement.scrollHeight===1080,'Vertical Full HD overflow');
 check(getComputedStyle(document.querySelector('.flap-text')).color==='rgb(255, 87, 0)','Wrong logo orange');
 check(document.querySelector('.demo-badge').textContent==='DEMO','Demo label missing');
 return {clock:document.querySelector('.clock').textContent,rows:8};
})()
JS);
    $screenshot=$cdp->call('Page.captureScreenshot',['format'=>'png','captureBeyondViewport'=>false]);
    file_put_contents($argv[2]??sys_get_temp_dir().'/binario-zero-preview.png',base64_decode($screenshot['data'],true));
    sleep(2); if($cdp->evaluate('document.querySelector(".clock").textContent')===$result['clock']) throw new RuntimeException('Clock is not ticking');
    $cdp->call('Emulation.setEmulatedMedia',['features'=>[['name'=>'prefers-reduced-motion','value'=>'reduce']]]);
    if($cdp->evaluate('getComputedStyle(document.querySelector(".flap")).animationName')!=='none') throw new RuntimeException('Reduced motion not respected');
    $cdp->call('Emulation.setDeviceMetricsOverride',['width'=>390,'height'=>844,'deviceScaleFactor'=>1,'mobile'=>false]);
    usleep(300000); if($cdp->evaluate('document.documentElement.scrollWidth')>390) throw new RuntimeException('Mobile viewport overflow');
    if($cdp->errors) throw new RuntimeException('JavaScript errors detected');
    echo "PASS Chromium: React rendering, 8 rows, logo, orange, Full HD, clock, reduced motion, mobile, no JavaScript errors\n";
} finally {
    fclose($pipes[0]); proc_terminate($process, 9); proc_close($process);
    $delete=function($path)use(&$delete){if(is_dir($path)&&!is_link($path)){foreach(scandir($path)as$f)if($f!=='.'&&$f!=='..')$delete($path.'/'.$f);@rmdir($path);}else @unlink($path);}; $delete($profile);
}
