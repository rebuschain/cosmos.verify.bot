export enum RebusNftType {
	None = 0,
	v1 = 1,
}

export type RebusNftId = {
	id_record: {
		address: string;
		type: RebusNftType;
		organization: string;
		encryption_key: string;
		metadata: string;
		document_number: string;
		id_number: string;
		active: boolean;
	};
};
