export type ServerConfig = {
    id: number;
    externalId: string;
    contractAddress: string | null;
    categoryChannelId: string | null;
    generalChannelId: string | null;
    disablePrivateMessages: boolean;
}

export type Role = {
    id: string;
    externalId: string;
    serverId: number;
    externalServerId: string;
    tokenId: string;
    minBalance: string;
    metaCondition: string;
    rebusNftid: string;
}

export type Nonce = {
    id: number;
    address: string;
    nonce: number;
}

export type Holder = {
    id: number;
    address: string;
    ethAddress: string;
    userId: string;
    externalServerId: string;
}
