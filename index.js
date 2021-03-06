module.exports = class MCP23008{
	constructor(addr, config, comm){
		this.data = config;
		this.comm = comm;
		this.addr = addr;
		this.settable = [];
		this.iodir = 0;
		this.data.ios = {};
		for(var i=8;i>0;i--){
			this.iodir = (this.iodir << 1) | (this.data["io_"+i] ? 0 : 1);
			this.data.ios[i] = this.data["io_"+i] ? 1 : 0;
		}
		this.settable = ['all', 'channel_1', 'channel_2', 'channel_3', 'channel_4', 'channel_5', 'channel_6', 'channel_7', 'channel_8'];
	}
	init(){
		Promise.all([
			this.comm.writeBytes(this.addr, 0x00, this.iodir),
			this.comm.writeBytes(this.addr, 0x02, this.data.interrupt ? this.iodir : 0),
			this.comm.writeBytes(this.addr, 0x04, 0),
			this.comm.writeBytes(this.addr, 0x06, this.iodir),
			this.get()
		]).then((r) => {
			this.initialized = true;
		}).catch((e) => {
			this.initialized = false;
		});
	}
	get(){
		var sensor = this;
		return new Promise((fulfill, reject) => {
			var get_p = [];
			Promise.all([
				this.data.interrupt ? sensor.comm.readByte(sensor.addr, 7) : Promise.resolve(0),
				sensor.comm.readByte(sensor.addr, 9),
				sensor.comm.readByte(sensor.addr, 10)
			]).then((res) => {
				sensor.trigger = res.shift();
				sensor.input_status = res[0];
				sensor.output_status = res[1];
				fulfill(sensor.parseStatus());
			}).catch((e) => {
				sensor.initialized = false;
				reject(e);
			});
		});
	}
	parseStatus(){
		var ios = this.data.ios,
			readings = {};
		for(var i in ios){
			if(ios[i] == 1) readings["channel_"+i] = this.output_status & (1 << (i-1)) ? 1 : 0;
			else readings["channel_"+i] = this.input_status & (1 << (i-1)) ? 0 : 1;
		}
		if(this.data.interrupt) readings.interrupt = this.trigger.toString(2).length;
		return readings;
	}
	set(topic, value){
		var sensor = this;
		return new Promise((fulfill, reject) => {
				function uninit(e){
					sensor.initialized = false;
					reject(e);
				}
				var status = sensor.output_status;
				if(topic == 'all'){
					if(status != value){
						sensor.output_status = value;
						sensor.comm.writeBytes(this.addr, 0x0A, value).then(fulfill(sensor.parseStatus())).catch(uninit);
					}else{
						fulfill(sensor.parseStatus());
					}
				}else{
					var channel = topic.split('_')[1];
					if(value == 1){
						status |= (1 << (channel-1));
					}else if(value == 2){
						status ^= (1 << (channel-1));
					}else{
						status &= ~(1 << (channel - 1));
					}
					if(sensor.output_status != status){
						sensor.output_status = status;
						sensor.comm.writeBytes(sensor.addr, 0x0A, status).then(fulfill(sensor.parseStatus())).catch(uninit);
					}else{
						fulfill(sensor.parseStatus());
					}
				}
		});
	}
}
