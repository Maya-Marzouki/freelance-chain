/** Access to the deployed `ReputationToken` contract (contract C, soulbound FLR token). */
import { Contract, formatUnits, type Signer } from "ethers";
import reputationToken from "@/contracts/ReputationToken.json";
import { getLocalProvider } from "@/lib/agreement-contract";
import { getSigner } from "@/lib/ethereum";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** FLR minted per ETH paid, mirrors `FREELANCER_RATE` / `CLIENT_RATE` in the contract. */
export const FREELANCER_RATE = 100;
export const CLIENT_RATE = 20;
/** Share of the freelancer reward kept when the work was not delivered by the deadline (`LATE_REWARD_PERCENT`). */
export const LATE_REWARD_PERCENT = 50;

/** Mirrors `ReputationToken.isDeliveredOnTime`: delivered, and no later than the agreement deadline. */
export function isDeliveredOnTime(agreement: { deliveredAt?: string; deadline: string }): boolean {
  return !!agreement.deliveredAt && new Date(agreement.deliveredAt).getTime() <= new Date(agreement.deadline).getTime();
}

/** FLR the freelancer and the client will receive for `paidEth`, as the contract computes it. */
export function expectedRewards(paidEth: number, onTime: boolean): { freelancerFlr: number; clientFlr: number } {
  const full = paidEth * FREELANCER_RATE;
  return {
    freelancerFlr: onTime ? full : (full * LATE_REWARD_PERCENT) / 100,
    clientFlr: paidEth * CLIENT_RATE,
  };
}

/** True once `npm run deploy:local` has written a real address to the ABI file. */
export const isReputationDeployed = reputationToken.address !== ZERO_ADDRESS;

function reader(): Contract {
  return new Contract(reputationToken.address, reputationToken.abi, getLocalProvider());
}

export interface ReputationSnapshot {
  /** FLR balance of the account (whole tokens, 18 decimals already applied). */
  balance: number;
  missionsCompleted: number;
  /** Whether the reward of the given agreement was already minted. */
  rewardClaimed: boolean;
}

export async function readReputation(account: string | null, agreementOnChainId: number): Promise<ReputationSnapshot> {
  const contract = reader();
  const [balance, missions, claimed] = await Promise.all([
    account ? (contract.balanceOf(account) as Promise<bigint>) : Promise.resolve(BigInt(0)),
    account ? (contract.missionsCompleted(account) as Promise<bigint>) : Promise.resolve(BigInt(0)),
    contract.rewardClaimed(agreementOnChainId) as Promise<boolean>,
  ]);
  return {
    balance: Number(formatUnits(balance, 18)),
    missionsCompleted: Number(missions),
    rewardClaimed: claimed,
  };
}

/** One `ReputationRewarded` event: the FLR minted for a finished agreement. */
export interface RewardRecord {
  id: string;
  agreementId: string;
  agreementTitle: string;
  freelancer: string;
  client: string;
  freelancerFlr: number;
  clientFlr: number;
  /** false: delivered late (or never), the freelancer got `LATE_REWARD_PERCENT` % only. */
  onTime: boolean;
  date: string; // ISO
  txHash: string;
  /** Who sent the claim transaction. */
  actor: string;
}

/** Every reward minted so far, newest first. */
export async function readRewards(titles: Map<string, string>): Promise<RewardRecord[]> {
  const contract = reader();
  const provider = getLocalProvider();
  // Fails on a token deployed before the deadline rule: its events would silently not match.
  await contract.LATE_REWARD_PERCENT();
  const logs = await contract.queryFilter(contract.filters.ReputationRewarded());
  const records = await Promise.all(
    logs.map(async (log): Promise<RewardRecord> => {
      const args = (log as unknown as {
        args: {
          agreementId: bigint;
          freelancer: string;
          client: string;
          freelancerReward: bigint;
          clientReward: bigint;
          onTime: boolean;
        };
      }).args;
      const [block, tx] = await Promise.all([provider.getBlock(log.blockNumber), log.getTransaction()]);
      const agreementId = `AGR-${Number(args.agreementId)}`;
      return {
        id: `${log.transactionHash}-${log.index}`,
        agreementId,
        agreementTitle: titles.get(agreementId) ?? agreementId,
        freelancer: args.freelancer,
        client: args.client,
        freelancerFlr: Number(formatUnits(args.freelancerReward, 18)),
        clientFlr: Number(formatUnits(args.clientReward, 18)),
        onTime: args.onTime,
        date: new Date(Number(block?.timestamp ?? 0) * 1000).toISOString(),
        txHash: log.transactionHash,
        actor: tx.from,
      };
    }),
  );
  return records.sort((a, b) => b.date.localeCompare(a.date));
}

/** Mints the reputation of a finished, fully paid agreement. Anyone can call it. */
export async function claimReputation(agreementOnChainId: number, signer?: Signer): Promise<string> {
  if (!isReputationDeployed) throw new Error("ReputationToken contract is not deployed yet.");
  const contract = new Contract(reputationToken.address, reputationToken.abi, signer ?? (await getSigner()));
  const tx = await contract.claimReward(agreementOnChainId);
  await tx.wait();
  return tx.hash as string;
}
